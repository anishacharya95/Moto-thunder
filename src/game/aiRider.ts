import * as THREE from 'three';
import { RiderProfile, RiderRaceState } from '../types/game';
import { MOTORCYCLES } from '../data/bikes';
import { buildMotorcycle, BuiltBike } from './bikeBuilder';
import { BuiltTrack } from './trackBuilder';

export class AIRiderController {
  public profile: RiderProfile;
  public bike: BuiltBike;
  public raceState: RiderRaceState;

  // AI navigation variables
  public progress: number = 0; // 0.0 to 1.0 along spline
  public lateralOffset: number = 0;
  public targetLateralOffset: number = 0;
  public speedMs: number = 0;
  public heading: number = 0;
  public leanAngle: number = 0;
  public gear: number = 1;
  public rpm: number = 4200;

  private topSpeedMs: number;
  private maxAccel: number;
  private maxBraking: number;
  private targetSpeedMs: number = 0;

  constructor(profile: RiderProfile, track: BuiltTrack, gridSlotIndex: number) {
    this.profile = profile;

    const bikeDef = MOTORCYCLES.find((b) => b.id === profile.bikeId) || MOTORCYCLES[0];
    this.bike = buildMotorcycle(bikeDef);

    // Initial position on grid
    const slot = track.gridSlots[gridSlotIndex] || track.gridSlots[0];
    this.bike.root.position.copy(slot.position);
    this.heading = slot.rotationY;
    this.bike.root.rotation.y = -this.heading;
    this.progress = slot.progress;

    // Performance tuning based on skill
    const skill = profile.skill;
    this.topSpeedMs = ((bikeDef.baseStats.topSpeed * 0.95) / 3.6) * skill;
    this.maxAccel = ((bikeDef.baseStats.acceleration / 100) * 12.0) * skill;
    this.maxBraking = ((bikeDef.baseStats.braking / 100) * 16.0) * skill;

    this.raceState = {
      rider: profile,
      distanceOnTrack: 0,
      splineProgress: slot.progress,
      currentLap: 1,
      currentPosition: gridSlotIndex + 1,
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

    this.targetLateralOffset = (Math.random() - 0.5) * 4.5;
    this.lateralOffset = this.targetLateralOffset;
  }

  public update(
    delta: number,
    track: BuiltTrack,
    allRiderPositions: THREE.Vector3[],
    raceActive: boolean
  ): void {
    if (!raceActive) {
      this.bike.updateAnimation(0, 0, 0, 0, false, delta);
      return;
    }

    const dt = Math.min(delta, 0.05);

    // Lookahead for corner braking
    const lookAheadMeters = Math.max(18, this.speedMs * 0.75);
    const lookAheadProgress = lookAheadMeters / track.trackLength;
    const targetT = (this.progress + lookAheadProgress) % 1.0;

    const tang1 = track.spline.getTangentAt(targetT).normalize();
    const tang2 = track.spline.getTangentAt((targetT + 0.035) % 1.0).normalize();

    const turnSeverity = Math.max(0, 1.0 - tang1.dot(tang2));
    const isHeavyCorner = turnSeverity > 0.035;

    if (isHeavyCorner) {
      const cornerSpeedFactor = Math.max(0.35, 1.0 - turnSeverity * 6.0);
      this.targetSpeedMs = this.topSpeedMs * cornerSpeedFactor;
    } else {
      this.targetSpeedMs = this.topSpeedMs;
    }

    // Avoidance nudge
    let avoidanceOffset = 0;
    const myPos = this.bike.root.position;
    for (const otherPos of allRiderPositions) {
      if (otherPos === myPos) continue;
      const dist = myPos.distanceTo(otherPos);
      if (dist < 5.0 && dist > 0.1) {
        const dx = myPos.x - otherPos.x;
        avoidanceOffset += dx > 0 ? 1.4 : -1.4;
      }
    }

    this.lateralOffset = THREE.MathUtils.damp(
      this.lateralOffset,
      this.targetLateralOffset + avoidanceOffset,
      3,
      dt
    );

    // Speed acceleration / braking
    if (this.speedMs < this.targetSpeedMs) {
      this.speedMs = Math.min(this.targetSpeedMs, this.speedMs + this.maxAccel * dt);
    } else {
      this.speedMs = Math.max(this.targetSpeedMs, this.speedMs - this.maxBraking * dt);
    }

    // Advance along spline
    const distanceStep = this.speedMs * dt;
    this.raceState.distanceOnTrack += distanceStep;
    this.progress = (this.progress + distanceStep / track.trackLength) % 1.0;
    this.raceState.splineProgress = this.progress;

    if (this.progress < 0.05 && this.raceState.splineProgress > 0.9) {
      this.raceState.currentLap++;
    }

    // Update 3D Position
    const currentPt = track.spline.getPointAt(this.progress);
    const currentTang = track.spline.getTangentAt(this.progress).normalize();
    const currentNorm = new THREE.Vector3().crossVectors(currentTang, new THREE.Vector3(0, 1, 0)).normalize();

    const finalPos = currentPt.clone().addScaledVector(currentNorm, this.lateralOffset);
    finalPos.y += 0.12; // Track elevation
    this.bike.root.position.copy(finalPos);

    // Orientation along tangent
    this.heading = Math.atan2(currentTang.x, -currentTang.z);
    this.bike.root.rotation.y = -this.heading;

    // Lean angle into corner
    const crossTurn = currentTang.x * tang1.z - currentTang.z * tang1.x;
    const targetRoll = -crossTurn * (this.speedMs / 18) * 1.8;
    this.leanAngle = THREE.MathUtils.damp(this.leanAngle, THREE.MathUtils.clamp(targetRoll, -1.05, 1.05), 6, dt);

    const isCrouched = !isHeavyCorner && this.speedMs > 45;
    this.bike.updateAnimation(this.speedMs, targetRoll * 0.25, this.leanAngle, 0, isCrouched, dt);

    this.raceState.speedKmh = this.speedMs * 3.6;
    this.raceState.gear = Math.min(6, Math.max(1, Math.floor(this.raceState.speedKmh / 55) + 1));
    this.raceState.rpm = 6000 + (this.speedMs / this.topSpeedMs) * 11500;
  }
}
