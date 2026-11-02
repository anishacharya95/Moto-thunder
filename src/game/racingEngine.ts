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

/** Physics timestep clamp: prevents explosions after a long hitch. */
const PHYSICS_MAX_DELTA = 0.05;
/** Race-clock clamp: keeps lap timing close to real time on slow devices
 *  without letting a background-tab suspension add minutes to a lap. */
const RACE_CLOCK_MAX_DELTA = 0.25;

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

  // Countdown: driven from the game loop (pauses with the race, cannot leak
  // past dispose(), and cannot double-start on restart()).
  // stage 0 = idle, 1-5 = red lights, 6 = GO, 7 = hold, 8 = lights out, -1 = done
  private countdownStage = -1;
  private countdownElapsedMs = 0;

  // Race timing: accumulated race time only advances while the race is active,
  // so paused time never inflates lap times or finish times.
  private raceTimeMs = 0;
  private playerLapStartMs = 0;
  private playerCompletedLaps = 0;
  private playerStartLinePending = true;
  private playerWentOffTrack = false;

  // Player progress tracking (monotonic, wrap-aware)
  private lastProgress = 0;
  private playerUnwrappedProgress = 0;
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

    // Progress tracking starts from the grid slot: the grid sits behind the
    // start/finish line, so initial race distance is negative (meters to go
    // before reaching the line). All riders share this same origin.
    this.lastProgress = playerSlot.progress;
    this.playerUnwrappedProgress = playerSlot.progress;
    this.playerCompletedLaps = 0;
    this.playerStartLinePending = true;
    this.playerLapStartMs = 0;
    this.raceTimeMs = 0;
    this.playerWentOffTrack = false;
    this.countdownStage = -1;
    this.countdownElapsedMs = 0;
    this.raceFinished = false;
    this.checkpointsPassedInLap.clear();
    this.lastCheckpointIndex = this.checkpointIndexAt(playerSlot.progress);

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
      distanceOnTrack: (playerSlot.progress - 1.0) * this.builtTrack.trackLength,
      splineProgress: playerSlot.progress,
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
            id: aiProfile.id,
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
      this.playerLapStartMs = 0;
    } else {
      this.startCountdown();
    }

    this.startLoop();
  }

  private checkpointIndexAt(progress: number): number {
    const total = this.builtTrack.checkpoints.length;
    if (total === 0) return 0;
    return Math.floor(progress * total) % total;
  }

  /**
   * Arms the start-lights countdown. The countdown itself is advanced by
   * updateCountdown() inside the game loop, so it pauses with the race and
   * stops automatically when the engine is disposed.
   */
  private startCountdown() {
    this.countdownElapsedMs = 0;
    this.countdownStage = 0;
    this.raceActive = false;
    this.raceFinished = false;
    this.builtTrack.setStartLightsCount(0, false);
  }

  private updateCountdown(delta: number) {
    if (this.countdownStage < 0) return;

    this.countdownElapsedMs += delta * 1000;
    const stage = Math.floor(this.countdownElapsedMs / 1000);
    if (stage <= this.countdownStage) return;
    this.countdownStage = stage;

    if (stage <= 5) {
      this.builtTrack.setStartLightsCount(stage, false);
      soundEngine.playCountdownBeep(false);
      this.callbacks.onCountdownUpdate(stage, false, `${stage}`);
    } else if (stage === 6) {
      this.builtTrack.setStartLightsCount(0, true);
      soundEngine.playCountdownBeep(true);
      this.callbacks.onCountdownUpdate(0, true, 'GO!');
      this.raceActive = true;
      this.callbacks.onRaceStart();
    } else if (stage >= 8) {
      this.builtTrack.setStartLightsCount(0, false);
      this.callbacks.onCountdownUpdate(0, false, '');
      this.countdownStage = -1;
    }
    // stage 7: lights stay green while the field accelerates away
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
    // Restarting always resumes the simulation (the pause menu and the
    // post-race screen both route through here).
    this.isPaused = false;
    soundEngine.resume();

    // Reset all race clocks and progression
    this.raceTimeMs = 0;
    this.playerLapStartMs = 0;
    this.playerCompletedLaps = 0;
    this.playerStartLinePending = true;
    this.playerWentOffTrack = false;
    this.countdownStage = -1;
    this.countdownElapsedMs = 0;
    this.raceFinished = false;
    this.raceActive = false;

    const playerSlot = this.builtTrack.gridSlots[0];
    this.playerPhysics.setPosition(playerSlot.position, playerSlot.rotationY);
    this.playerBike.root.position.copy(playerSlot.position);
    this.playerBike.root.rotation.set(0, -playerSlot.rotationY, 0);
    this.cameraManager.reset();

    this.lastProgress = playerSlot.progress;
    this.playerUnwrappedProgress = playerSlot.progress;
    this.lastCheckpointIndex = this.checkpointIndexAt(playerSlot.progress);
    this.checkpointsPassedInLap.clear();

    // Neutral inputs so no throttle/brake persists into the new race
    this.playerInput = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      steer: 0,
      tuckIn: false,
    };

    Object.assign(this.playerState, {
      distanceOnTrack: (playerSlot.progress - 1.0) * this.builtTrack.trackLength,
      splineProgress: playerSlot.progress,
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
    });

    this.aiControllers.forEach((ai, idx) => {
      ai.reset(this.builtTrack, idx + 1);
    });

    if (this.mode !== 'practice') {
      this.startCountdown();
    } else {
      this.raceActive = true;
      this.playerLapStartMs = 0;
    }
  }

  private startLoop() {
    this.isRunning = true;
    this.lastTime = performance.now();

    const tick = (now: number) => {
      if (!this.isRunning) return;

      const rawDelta = (now - this.lastTime) / 1000;
      const delta = Math.min(rawDelta, PHYSICS_MAX_DELTA);
      const clockDelta = Math.min(rawDelta, RACE_CLOCK_MAX_DELTA);
      this.lastTime = now;

      if (!this.isPaused) {
        this.updateGame(delta, clockDelta);
      }

      this.renderer.render(this.scene, this.cameraManager.camera);
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private updateGame(delta: number, clockDelta: number) {
    // 1. Start-lights countdown (pausable, leak-free)
    this.updateCountdown(clockDelta);

    const playerPos = this.playerPhysics.state.position;
    const closestInfo = this.getClosestSplineInfo(playerPos);

    // Keep motorcycle elevation firmly glued to asphalt road surface on hills/slopes
    this.playerPhysics.state.position.y = closestInfo.roadY;

    if (this.raceActive) {
      // Advance the race clock before physics so this frame's lap crossing
      // is timed against the freshest race time.
      this.raceTimeMs += clockDelta * 1000;
      this.playerPhysics.update(this.playerInput, delta, {
        distToCenter: closestInfo.distance,
        trackHalfWidth: this.builtTrack.getTrackWidth() * 0.5,
      });
    }

    const phys = this.playerPhysics.state;
    phys.position.y = closestInfo.roadY;

    if (this.raceActive && phys.isOffTrack) {
      this.playerWentOffTrack = true;
    }

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
    this.updatePlayerRaceProgress(closestInfo.progress);

    this.playerState.speedKmh = phys.speedKmh;
    this.playerState.gear = phys.gear;
    this.playerState.rpm = phys.rpm;
    this.playerState.leanAngleRad = phys.roll;
    this.playerState.isOffTrack = phys.isOffTrack;
    this.playerState.isCrouched = this.playerInput.tuckIn;
    this.playerState.currentLapTime = this.raceActive
      ? this.raceTimeMs - this.playerLapStartMs
      : this.playerState.currentLapTime;

    // Update AI Fleet
    const allRiderPositions: THREE.Vector3[] = [this.playerBike.root.position];
    this.aiControllers.forEach((ai) => allRiderPositions.push(ai.bike.root.position));

    this.aiControllers.forEach((ai) => {
      ai.update(
        delta,
        this.builtTrack,
        allRiderPositions,
        this.raceActive,
        this.raceTimeMs,
        this.totalLaps
      );
    });

    // Update Race Positions, gaps and classification order
    this.buildClassification();

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
    this.callbacks.onTelemetryUpdate({
      speedKmh: Math.round(phys.speedKmh),
      gear: phys.gear,
      rpm: Math.round(phys.rpm),
      leanDeg: Math.round((phys.roll * 180) / Math.PI),
      position: this.playerState.currentPosition,
      totalRiders: this.aiControllers.length + 1,
      lap: this.playerState.currentLap,
      totalLaps: this.totalLaps,
      currentLapTimeMs: this.raceActive ? this.raceTimeMs - this.playerLapStartMs : 0,
      bestLapTimeMs: this.playerState.bestLapTime,
      gapAheadSec: this.playerState.gapToAheadSec,
      isOffTrack: phys.isOffTrack,
      isCrouched: this.playerInput.tuckIn,
      playerPos: { x: phys.position.x, z: phys.position.z },
      splineProgress: closestInfo.progress,
    });
  }

  /**
   * Tracks the player's race progress with a monotonic, wrap-aware progress
   * value so race distance never resets at the start/finish line, positions
   * and gaps stay consistent, and laps are counted exactly once per crossing.
   */
  private updatePlayerRaceProgress(currentProgress: number) {
    const trackLength = this.builtTrack.trackLength;

    let deltaProgress = currentProgress - this.lastProgress;
    let crossedLineForward = false;
    let crossedLineBackward = false;
    if (deltaProgress < -0.5) {
      deltaProgress += 1.0; // wrapped forward across the start/finish line
      crossedLineForward = true;
    } else if (deltaProgress > 0.5) {
      deltaProgress -= 1.0; // rolled backwards across the line
      crossedLineBackward = true;
    }
    this.playerUnwrappedProgress += deltaProgress;
    this.lastProgress = currentProgress;

    this.playerState.splineProgress = currentProgress;
    this.playerState.distanceOnTrack =
      (this.playerUnwrappedProgress - 1.0) * trackLength;

    // Checkpoint bookkeeping: credit every checkpoint passed this frame
    // (handles skipped indices at low frame rates; backwards movement credits
    // nothing, so reversing over the line cannot farm checkpoints).
    const totalCheckpoints = this.builtTrack.checkpoints.length;
    if (totalCheckpoints > 0) {
      const currentCpIdx = Math.floor(currentProgress * totalCheckpoints) % totalCheckpoints;
      if (currentCpIdx !== this.lastCheckpointIndex) {
        // A backward wrap makes the raw index jump UP (31 -> 0 in reverse
        // reads as 0 -> 31), so wraps must be direction-aware or reversing
        // across the line would credit an entire lap's checkpoints.
        const movedForward =
          crossedLineForward ||
          (!crossedLineBackward && currentCpIdx > this.lastCheckpointIndex);
        if (movedForward) this.markCheckpointsToward(currentCpIdx, totalCheckpoints);
        this.lastCheckpointIndex = currentCpIdx;
      }
    }

    if (this.raceActive && crossedLineForward) {
      this.handlePlayerLineCrossing();
    }
  }

  private markCheckpointsToward(targetIdx: number, total: number) {
    let cursor = this.lastCheckpointIndex;
    for (let step = 0; step < total; step++) {
      cursor = (cursor + 1) % total;
      this.checkpointsPassedInLap.add(cursor);
      if (cursor === targetIdx) break;
    }
  }

  /**
   * Handles a forward crossing of the start/finish line by the player.
   *
   * The grid sits behind the line, so the first crossing begins lap 1 without
   * completing it. Later crossings complete a lap (subject to checkpoint
   * validation, which blocks shortcutting but can no longer stall an honest
   * lap), record lap timing, and finish the race after the final lap.
   */
  private handlePlayerLineCrossing() {
    if (this.playerState.finished) return;

    if (this.playerStartLinePending) {
      // Standing start: this crossing begins lap 1. Lap 1 is timed from the
      // green flag (same rule the AI riders follow).
      this.playerStartLinePending = false;
      return;
    }

    const totalCheckpoints = this.builtTrack.checkpoints.length;
    const validated =
      totalCheckpoints === 0 || this.checkpointsPassedInLap.size > totalCheckpoints * 0.8;
    if (!validated) {
      // Too many checkpoints missed (shortcut attempt): lap is not counted.
      this.checkpointsPassedInLap.clear();
      return;
    }

    const lapJustCompleted = this.playerState.currentLap;
    this.playerCompletedLaps++;

    const lapTimeMs = this.raceTimeMs - this.playerLapStartMs;
    this.playerLapStartMs = this.raceTimeMs;
    this.playerState.lastLapTime = lapTimeMs;
    if (this.playerState.bestLapTime === null || lapTimeMs < this.playerState.bestLapTime) {
      this.playerState.bestLapTime = lapTimeMs;
    }

    this.callbacks.onLapCompleted(lapJustCompleted, lapTimeMs, this.playerState.bestLapTime);
    this.checkpointsPassedInLap.clear();

    if (this.mode !== 'practice' && this.playerCompletedLaps >= this.totalLaps) {
      this.playerState.currentLap = this.totalLaps;
      this.finishPlayerRace();
    } else {
      this.playerState.currentLap = this.playerCompletedLaps + 1;
    }
  }

  private finishPlayerRace() {
    this.playerState.finished = true;
    this.playerState.finishTime = this.raceTimeMs;
    this.playerState.currentLap = this.totalLaps;
    // Clean-race bonus reflects whether the player ever left the track,
    // not just where they happened to be at the line.
    this.playerState.isOffTrack = this.playerWentOffTrack;

    // The race is over: freeze clocks and race progression, release inputs.
    this.raceActive = false;
    this.playerInput = {
      throttle: 0,
      frontBrake: 0,
      rearBrake: 0,
      steer: 0,
      tuckIn: false,
    };

    this.finalizeRace();
  }

  /**
   * Builds the official classification: finishers first ordered by finish
   * time, then riders still racing ordered by distance covered. Also fills
   * live positions and time/distance gaps on every rider state.
   */
  private buildClassification(): RiderRaceState[] {
    const allRiders: RiderRaceState[] = [
      this.playerState,
      ...this.aiControllers.map((ai) => ai.raceState),
    ];

    allRiders.sort((a, b) => {
      const aFinished = a.finished && a.finishTime !== null;
      const bFinished = b.finished && b.finishTime !== null;
      if (aFinished && bFinished) return (a.finishTime as number) - (b.finishTime as number);
      if (aFinished) return -1;
      if (bFinished) return 1;
      return b.distanceOnTrack - a.distanceOnTrack;
    });

    allRiders.forEach((r, idx) => {
      r.currentPosition = idx + 1;
    });

    const leader = allRiders[0];
    allRiders.forEach((r, idx) => {
      r.gapToLeaderSec = this.estimateGapSec(leader, r);
      r.gapToAheadSec = idx === 0 ? 0 : this.estimateGapSec(allRiders[idx - 1], r);
    });

    return allRiders;
  }

  /** Time gap between a rider and the rider ahead (finish-time exact when
   *  both have finished, distance/speed estimate otherwise). */
  private estimateGapSec(ahead: RiderRaceState, rider: RiderRaceState): number {
    if (ahead === rider) return 0;

    const bothFinished =
      ahead.finished &&
      rider.finished &&
      ahead.finishTime !== null &&
      rider.finishTime !== null;
    if (bothFinished) {
      return Math.max(0, ((rider.finishTime as number) - (ahead.finishTime as number)) / 1000);
    }

    const distBehind = ahead.distanceOnTrack - rider.distanceOnTrack;
    if (distBehind <= 0) return 0;
    const speedMs = Math.max(10, rider.speedKmh / 3.6);
    return distBehind / speedMs;
  }

  private finalizeRace() {
    if (this.raceFinished) return;
    this.raceFinished = true;
    soundEngine.playVictoryFanfare();

    const classification = this.buildClassification();
    this.callbacks.onRaceFinish(classification);
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

  public resize(width: number, height: number) {
    this.renderer.setSize(width, height);
    this.cameraManager.resize(width, height);
  }

  public dispose() {
    this.isRunning = false;
    this.countdownStage = -1; // stop any pending countdown state
    cancelAnimationFrame(this.frameId);
    soundEngine.stopAll();
    this.builtTrack.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
