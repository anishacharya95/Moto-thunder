import * as THREE from 'three';
import {
  CircuitDefinition,
  BikeDefinition,
  BikeCustomization,
  BikeUpgrades,
  GameMode,
  RiderRaceState,
  PlayerSettings,
  TelemetryData,
} from '../types/game';
import { AI_RIDER_ROSTER } from '../data/bikes';
import { buildTrack, BuiltTrack } from './trackBuilder';
import { buildMotorcycle, BuiltBike } from './bikeBuilder';
import { MotorcyclePhysics, RiderInput } from './physics';
import { AIRiderController } from './aiRider';
import { CameraManager } from './cameraManager';
import { soundEngine } from '../services/audio';

export interface RaceEngineCallbacks {
  onCountdownUpdate: (lightsCount: number, isGreen: boolean, label: string) => void;
  onRaceStart: () => void;
  onLapCompleted: (lap: number, lapTimeMs: number, bestLapMs: number | null) => void;
  onRaceFinish: (results: RiderRaceState[]) => void;
  onTelemetryUpdate: (data: TelemetryData) => void;
}

export class RacingEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cameraManager: CameraManager;

  // Track & Environment
  private circuit: CircuitDefinition;
  private builtTrack: BuiltTrack;
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  // Player
  public playerBike: BuiltBike;
  public playerPhysics: MotorcyclePhysics;
  public playerState: RiderRaceState;
  private playerInput: RiderInput;

  // AI Fleet
  public aiControllers: AIRiderController[] = [];

  // Particle systems
  private sparkParticles: THREE.Points;
  private sparkPositions: Float32Array;
  private sparkVelocities: Float32Array;
  private sparkCount = 120;

  // Race Management
  private mode: GameMode;
  private totalLaps: number;
  private settings: PlayerSettings;
  private callbacks: RaceEngineCallbacks;

  private isRunning = false;
  private isPaused = false;
  private raceActive = false;
  private raceFinished = false;

  private countdownTimer = 0;
  private raceStartTime = 0;
  private lapStartTime = 0;
  private lastCheckpointIndex = 0;
  private checkpointsPassedInLap = new Set<number>();

  private frameId = 0;
  private lastTime = 0;
  private isSoftwareGl = false;

  constructor(
    container: HTMLElement,
    circuit: CircuitDefinition,
    bikeDef: BikeDefinition,
    customColors: BikeCustomization,
    upgrades: BikeUpgrades,
    mode: GameMode,
    totalLaps: number,
    settings: PlayerSettings,
    callbacks: RaceEngineCallbacks
  ) {
    this.container = container;
    this.circuit = circuit;
    this.mode = mode;
    this.totalLaps = totalLaps;
    this.settings = settings;
    this.callbacks = callbacks;

    // Detect software WebGL
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 1. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && settings.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, settings.graphicsQuality === 'ultra' ? 2 : 1.5)
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && settings.graphicsQuality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // 2. Scene & Outdoor Atmospheric Lighting
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(circuit.skyColors.sky);
    this.scene.fog = new THREE.Fog(circuit.skyColors.horizon, 320, 1800);

    // Directional Sunlight
    this.dirLight = new THREE.DirectionalLight(
      new THREE.Color(circuit.skyColors.sunColor),
      circuit.skyColors.sunIntensity
    );
    this.dirLight.position.set(...circuit.skyColors.sunPosition);
    if (this.renderer.shadowMap.enabled) {
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.camera.near = 10;
      this.dirLight.shadow.camera.far = 1400;
      const d = 180;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.bias = -0.0005;
    }
    this.scene.add(this.dirLight);

    // Sky / Ground Fill Light
    this.hemiLight = new THREE.HemisphereLight(
      circuit.skyColors.sky,
      circuit.skyColors.ground,
      circuit.skyColors.ambientIntensity
    );
    this.scene.add(this.hemiLight);

    // 3. Build Track
    this.builtTrack = buildTrack(circuit);
    this.scene.add(this.builtTrack.group);

    // 4. Build Player Motorcycle & Physics
    // Player starts on Pole Position (Slot 0) facing forward along track
    const playerSlot = this.builtTrack.gridSlots[0];
    this.playerBike = buildMotorcycle(bikeDef, customColors);
    this.playerBike.root.position.copy(playerSlot.position);
    this.playerBike.root.rotation.y = -playerSlot.rotationY;
    this.scene.add(this.playerBike.root);

    this.playerPhysics = new MotorcyclePhysics(
      bikeDef.baseStats,
      upgrades,
      playerSlot.position,
      playerSlot.rotationY,
      true
    );

    this.playerInput = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      steer: 0,
      tuckIn: false,
    };

    this.playerState = {
      rider: {
        id: 'player',
        name: 'Player',
        nationality: 'Global',
        number: customColors.raceNumber,
        bikeId: bikeDef.id,
        isPlayer: true,
        skill: 1.0,
        aggressiveness: 1.0,
      },
      distanceOnTrack: 0,
      splineProgress: 0,
      currentLap: 1,
      currentPosition: 1,
      speedKmh: 0,
      gear: 1,
      rpm: 4200,
      leanAngleRad: 0,
      isCrouched: false,
      isOffTrack: false,
      isDrafting: false,
      lastLapTime: null,
      bestLapTime: null,
      currentLapTime: 0,
      sectorTimes: [],
      finished: false,
      finishTime: null,
      gapToLeaderSec: 0,
      gapToAheadSec: 0,
    };

    // 5. Spawn AI Grid (Except in Practice or Time Trial modes)
    if (this.mode !== 'practice' && this.mode !== 'time_trial') {
      const aiRidersToSpawn = AI_RIDER_ROSTER.slice(0, 11);
      aiRidersToSpawn.forEach((aiProfile, idx) => {
        const gridSlotIdx = idx + 1;
        const aiController = new AIRiderController(
          {
            id: `ai_${idx}`,
            name: aiProfile.name,
            nationality: aiProfile.nationality,
            number: aiProfile.number,
            bikeId: aiProfile.bikeId,
            isPlayer: false,
            skill: aiProfile.skill,
            aggressiveness: aiProfile.aggressiveness,
          },
          this.builtTrack,
          gridSlotIdx
        );
        this.aiControllers.push(aiController);
        this.scene.add(aiController.bike.root);
      });
    }

    // 6. Camera Manager (aspect ratio from container)
    this.cameraManager = new CameraManager(container.clientWidth / container.clientHeight);

    // Initial camera position update so first frame is perfectly positioned
    this.cameraManager.update(
      playerSlot.position,
      playerSlot.rotationY,
      0,
      0,
      0,
      0.016
    );

    // 7. Spark Particle System
    const sparkGeom = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(this.sparkCount * 3);
    this.sparkVelocities = new Float32Array(this.sparkCount * 3);
    for (let i = 0; i < this.sparkCount * 3; i++) {
      this.sparkPositions[i] = 0;
      this.sparkVelocities[i] = 0;
    }
    sparkGeom.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.22,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.sparkParticles = new THREE.Points(sparkGeom, sparkMat);
    this.scene.add(this.sparkParticles);

    // Initialize audio
    soundEngine.init();
    soundEngine.setVolumes(settings.soundVolume, settings.engineVolume, settings.fxVolume);

    if (this.mode === 'practice') {
      this.raceActive = true;
      this.lapStartTime = performance.now();
    } else {
      this.startCountdown();
    }

    this.startLoop();
  }

  private startCountdown() {
    this.countdownTimer = 0;
    this.builtTrack.setStartLightsCount(0, false);

    const countdownInterval = window.setInterval(() => {
      this.countdownTimer++;
      if (this.countdownTimer <= 5) {
        this.builtTrack.setStartLightsCount(this.countdownTimer, false);
        soundEngine.playCountdownBeep(false);
        this.callbacks.onCountdownUpdate(this.countdownTimer, false, `${this.countdownTimer}`);
      } else if (this.countdownTimer === 6) {
        this.builtTrack.setStartLightsCount(0, true);
        soundEngine.playCountdownBeep(true);
        this.callbacks.onCountdownUpdate(0, true, 'GO!');
        this.raceActive = true;
        this.raceStartTime = performance.now();
        this.lapStartTime = performance.now();
        this.callbacks.onRaceStart();
      } else if (this.countdownTimer >= 8) {
        this.builtTrack.setStartLightsCount(0, false);
        this.callbacks.onCountdownUpdate(0, false, '');
        window.clearInterval(countdownInterval);
      }
    }, 1000);
  }

  public setPlayerInput(input: Partial<RiderInput>) {
    this.playerInput = { ...this.playerInput, ...input };
  }

  public toggleCamera() {
    this.cameraManager.nextMode();
  }

  public pause() {
    this.isPaused = true;
    soundEngine.stopAll();
  }

  public resume() {
    this.isPaused = false;
    soundEngine.resume();
  }

  public restart() {
    const playerSlot = this.builtTrack.gridSlots[0];
    this.playerPhysics.setPosition(playerSlot.position, playerSlot.rotationY);
    this.playerBike.root.position.copy(playerSlot.position);
    this.playerBike.root.rotation.set(0, -playerSlot.rotationY, 0);
    this.cameraManager.reset();

    this.playerState.distanceOnTrack = 0;
    this.playerState.splineProgress = playerSlot.progress;
    this.playerState.currentLap = 1;
    this.playerState.currentLapTime = 0;
    this.playerState.finished = false;
    this.raceActive = false;
    this.raceFinished = false;
    this.checkpointsPassedInLap.clear();

    this.aiControllers.forEach((ai, idx) => {
      const slot = this.builtTrack.gridSlots[idx + 1] || this.builtTrack.gridSlots[0];
      ai.bike.root.position.copy(slot.position);
      ai.bike.root.rotation.set(0, -slot.rotationY, 0);
      ai.speedMs = 0;
      ai.progress = slot.progress;
      ai.raceState.distanceOnTrack = 0;
      ai.raceState.splineProgress = slot.progress;
      ai.raceState.currentLap = 1;
      ai.raceState.finished = false;
    });

    if (this.mode !== 'practice') {
      this.startCountdown();
    } else {
      this.raceActive = true;
      this.lapStartTime = performance.now();
    }
  }

  private startLoop() {
    this.isRunning = true;
    this.lastTime = performance.now();

    const tick = (now: number) => {
      if (!this.isRunning) return;

      const delta = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;

      if (!this.isPaused) {
        this.updateGame(delta, now);
      }

      this.renderer.render(this.scene, this.cameraManager.camera);
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private updateGame(delta: number, now: number) {
    const playerPos = this.playerPhysics.state.position;
    const closestInfo = this.getClosestSplineInfo(playerPos);

    // Keep motorcycle elevation firmly glued to asphalt road surface on hills/slopes
    this.playerPhysics.state.position.y = closestInfo.roadY;

    if (this.raceActive) {
      this.playerPhysics.update(this.playerInput, delta, {
        distToCenter: closestInfo.distance,
        trackHalfWidth: this.builtTrack.getTrackWidth() * 0.5,
      });
    }

    const phys = this.playerPhysics.state;
    phys.position.y = closestInfo.roadY;

    // Apply 3D position & animation
    this.playerBike.root.position.set(phys.position.x, phys.position.y, phys.position.z);
    this.playerBike.root.rotation.y = -phys.heading;
    this.playerBike.updateAnimation(
      phys.speedMs,
      phys.steerAngle,
      phys.roll,
      phys.pitch,
      this.playerInput.tuckIn,
      delta
    );

    // Lap & Checkpoint Validation
    const currentProgress = closestInfo.progress;
    this.playerState.splineProgress = currentProgress;
    this.playerState.distanceOnTrack = (this.playerState.currentLap - 1) * this.builtTrack.trackLength + currentProgress * this.builtTrack.trackLength;
    this.playerState.speedKmh = phys.speedKmh;
    this.playerState.gear = phys.gear;
    this.playerState.rpm = phys.rpm;
    this.playerState.leanAngleRad = phys.roll;
    this.playerState.isOffTrack = phys.isOffTrack;
    this.playerState.isCrouched = this.playerInput.tuckIn;

    const totalCheckpoints = this.builtTrack.checkpoints.length;
    const currentCpIdx = Math.floor(currentProgress * totalCheckpoints);
    if (currentCpIdx !== this.lastCheckpointIndex) {
      this.checkpointsPassedInLap.add(currentCpIdx);
      this.lastCheckpointIndex = currentCpIdx;
    }

    if (this.raceActive && currentProgress < 0.05 && this.checkpointsPassedInLap.size > totalCheckpoints * 0.8) {
      const lapTimeMs = now - this.lapStartTime;
      this.lapStartTime = now;
      this.playerState.lastLapTime = lapTimeMs;
      if (!this.playerState.bestLapTime || lapTimeMs < this.playerState.bestLapTime) {
        this.playerState.bestLapTime = lapTimeMs;
      }
      this.callbacks.onLapCompleted(this.playerState.currentLap, lapTimeMs, this.playerState.bestLapTime);
      this.checkpointsPassedInLap.clear();

      if (this.playerState.currentLap >= this.totalLaps && this.mode !== 'practice') {
        this.playerState.finished = true;
        this.playerState.finishTime = now - this.raceStartTime;
        this.checkRaceFinish();
      } else {
        this.playerState.currentLap++;
      }
    }

    // Update AI Fleet
    const allRiderPositions: THREE.Vector3[] = [this.playerBike.root.position];
    this.aiControllers.forEach((ai) => allRiderPositions.push(ai.bike.root.position));

    this.aiControllers.forEach((ai) => {
      ai.update(delta, this.builtTrack, allRiderPositions, this.raceActive);
      if (ai.raceState.currentLap > this.totalLaps && !ai.raceState.finished) {
        ai.raceState.finished = true;
        ai.raceState.finishTime = now - this.raceStartTime;
      }
    });

    // Update Race Positions
    const allRiders: RiderRaceState[] = [this.playerState, ...this.aiControllers.map((ai) => ai.raceState)];
    allRiders.sort((a, b) => b.distanceOnTrack - a.distanceOnTrack);

    allRiders.forEach((r, idx) => {
      r.currentPosition = idx + 1;
    });

    const playerIdx = allRiders.findIndex((r) => r.rider.isPlayer);
    let gapAhead = 0;
    if (playerIdx > 0) {
      const leaderDist = allRiders[playerIdx - 1].distanceOnTrack;
      const myDist = this.playerState.distanceOnTrack;
      const distDiff = leaderDist - myDist;
      gapAhead = Math.max(0, distDiff / Math.max(1, phys.speedMs));
    }

    // Sparks & Audio
    this.updateSparks(phys.isScrapingKnee, phys.isOverKerb, phys.position, phys.roll, delta);
    soundEngine.updateEngine(phys.rpm, this.playerInput.throttle, phys.speedKmh, 1.0, phys.isLimiter);
    soundEngine.updateTireEffects(phys.skidRatio, phys.isOverKerb, phys.isScrapingKnee);

    if (this.settings.hapticFeedback && (phys.isOverKerb || phys.isScrapingKnee) && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {}
    }

    // Third-person camera behind motorcycle
    this.cameraManager.update(
      this.playerBike.root.position,
      phys.heading,
      phys.pitch,
      phys.roll,
      phys.speedKmh,
      delta
    );

    // Telemetry Callback for HUD
    const currentLapMs = this.raceActive ? now - this.lapStartTime : 0;
    this.callbacks.onTelemetryUpdate({
      speedKmh: Math.round(phys.speedKmh),
      gear: phys.gear,
      rpm: Math.round(phys.rpm),
      leanDeg: Math.round((phys.roll * 180) / Math.PI),
      position: this.playerState.currentPosition,
      totalRiders: allRiders.length,
      lap: this.playerState.currentLap,
      totalLaps: this.totalLaps,
      currentLapTimeMs: currentLapMs,
      bestLapTimeMs: this.playerState.bestLapTime,
      gapAheadSec: gapAhead,
      isOffTrack: phys.isOffTrack,
      isCrouched: this.playerInput.tuckIn,
      playerPos: { x: phys.position.x, z: phys.position.z },
      splineProgress: closestInfo.progress,
    });
  }

  private getClosestSplineInfo(pos: THREE.Vector3) {
    return this.builtTrack.getClosestTrackInfo(pos);
  }

  private updateSparks(isScraping: boolean, isKerb: boolean, pos: THREE.Vector3, roll: number, delta: number) {
    const positions = this.sparkPositions;
    const vels = this.sparkVelocities;

    if (isScraping || isKerb) {
      const emitSide = roll > 0 ? 0.35 : -0.35;
      for (let i = 0; i < 4; i++) {
        const idx = Math.floor(Math.random() * this.sparkCount) * 3;
        positions[idx] = pos.x + emitSide;
        positions[idx + 1] = 0.16;
        positions[idx + 2] = pos.z;

        vels[idx] = (Math.random() - 0.5) * 8;
        vels[idx + 1] = 2 + Math.random() * 5;
        vels[idx + 2] = (Math.random() - 0.5) * 8;
      }
    }

    for (let i = 0; i < this.sparkCount; i++) {
      const idx = i * 3;
      if (positions[idx + 1] > 0) {
        positions[idx] += vels[idx] * delta;
        positions[idx + 1] += vels[idx + 1] * delta;
        positions[idx + 2] += vels[idx + 2] * delta;
        vels[idx + 1] -= 9.8 * delta;
        if (positions[idx + 1] <= 0) {
          positions[idx + 1] = -100;
        }
      }
    }
    this.sparkParticles.geometry.attributes.position.needsUpdate = true;
  }

  private checkRaceFinish() {
    if (this.raceFinished) return;
    this.raceFinished = true;
    soundEngine.playVictoryFanfare();

    const allRiders: RiderRaceState[] = [this.playerState, ...this.aiControllers.map((ai) => ai.raceState)];
    allRiders.sort((a, b) => b.distanceOnTrack - a.distanceOnTrack);
    allRiders.forEach((r, idx) => (r.currentPosition = idx + 1));

    this.callbacks.onRaceFinish(allRiders);
  }

  public resize(width: number, height: number) {
    this.renderer.setSize(width, height);
    this.cameraManager.resize(width, height);
  }

  public dispose() {
    this.isRunning = false;
    cancelAnimationFrame(this.frameId);
    soundEngine.stopAll();
    this.builtTrack.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
