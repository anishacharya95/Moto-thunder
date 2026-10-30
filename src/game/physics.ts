import * as THREE from 'three';
import { BikeStats, BikeUpgrades } from '../types/game';

export interface RiderInput {
  throttle: number;      // 0 to 1
  frontBrake: number;    // 0 to 1
  rearBrake: number;     // 0 to 1
  steer: number;         // -1 (full left) to +1 (full right)
  tuckIn: boolean;       // crouch for aero efficiency
  shiftUp?: boolean;
  shiftDown?: boolean;
}

export interface PhysicsState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speedMs: number;
  speedKmh: number;
  heading: number;       // radians (yaw, 0 = facing along -Z)
  pitch: number;         // radians (front fork dive / rear squat)
  roll: number;          // radians (lean angle, positive = leaning right)
  steerAngle: number;
  gear: number;          // 1 to 6
  rpm: number;           // 4000 to 18500
  isLimiter: boolean;
  isOffTrack: boolean;
  isOverKerb: boolean;
  isScrapingKnee: boolean;
  skidRatio: number;     // 0 to 1 (tire slide)
  trailBrakingSlide: boolean;
}

// Gear ratios for 1000cc MotoGP prototype
const GEAR_RATIOS = [0, 2.65, 2.10, 1.72, 1.45, 1.25, 1.10];
const FINAL_DRIVE = 2.45;
const IDLE_RPM = 4200;
const REDLINE_RPM = 18000;
const MAX_RPM = 18500;

export class MotorcyclePhysics {
  public state: PhysicsState;
  private stats: BikeStats;
  private upgrades: BikeUpgrades;
  private autoShift: boolean;

  // Upgraded effective multipliers
  private effectiveTopSpeed: number;
  private effectiveAccel: number;
  private effectiveBraking: number;
  private effectiveHandling: number;
  private effectiveGrip: number;

  constructor(
    stats: BikeStats,
    upgrades: BikeUpgrades,
    initialPos: THREE.Vector3 = new THREE.Vector3(),
    initialHeading = 0,
    autoShift = true
  ) {
    this.stats = stats;
    this.upgrades = upgrades;
    this.autoShift = autoShift;

    // Upgrades calculation (0-5)
    const engBonus = 1 + upgrades.engine * 0.04;
    const brkBonus = 1 + upgrades.brakes * 0.045;
    const chsBonus = 1 + upgrades.chassis * 0.04;
    const tireBonus = 1 + upgrades.tires * 0.05;
    const aeroBonus = 1 + upgrades.aero * 0.035;

    this.effectiveTopSpeed = (stats.topSpeed * engBonus * (1 + aeroBonus * 0.015)) / 3.6; // in m/s
    this.effectiveAccel = (stats.acceleration / 100) * 13.0 * engBonus; // m/s^2
    this.effectiveBraking = (stats.braking / 100) * 17.5 * brkBonus;    // m/s^2
    this.effectiveHandling = (stats.handling / 100) * chsBonus;
    this.effectiveGrip = 1.4 * tireBonus;

    this.state = {
      position: initialPos.clone(),
      velocity: new THREE.Vector3(),
      speedMs: 0,
      speedKmh: 0,
      heading: initialHeading,
      pitch: 0,
      roll: 0,
      steerAngle: 0,
      gear: 1,
      rpm: IDLE_RPM,
      isLimiter: false,
      isOffTrack: false,
      isOverKerb: false,
      isScrapingKnee: false,
      skidRatio: 0,
      trailBrakingSlide: false,
    };
  }

  public update(input: RiderInput, delta: number, trackInfo?: { distToCenter: number; trackHalfWidth: number }): void {
    const dt = Math.min(delta, 0.05);

    // 1. Surface check (Track, Kerb, Runoff Gravel)
    let surfaceGrip = 1.0;
    this.state.isOffTrack = false;
    this.state.isOverKerb = false;

    if (trackInfo) {
      const d = Math.abs(trackInfo.distToCenter);
      const halfW = trackInfo.trackHalfWidth;
      if (d > halfW + 2.0) {
        // In gravel / grass runoff
        this.state.isOffTrack = true;
        surfaceGrip = 0.50;
      } else if (d > halfW) {
        // On rumble strip curb
        this.state.isOverKerb = true;
        surfaceGrip = 0.90;
      }
    }

    // 2. Transmission & RPM Logic
    const currentRatio = GEAR_RATIOS[this.state.gear] * FINAL_DRIVE;
    const wheelCircumference = 2 * Math.PI * 0.31;
    const calculatedRpm = (this.state.speedMs / wheelCircumference) * currentRatio * 60;
    this.state.rpm = Math.max(IDLE_RPM, Math.min(calculatedRpm + (input.throttle > 0 ? 1200 * input.throttle : 0), MAX_RPM));
    this.state.isLimiter = this.state.rpm >= REDLINE_RPM;

    // Automatic Quickshifter
    if (this.autoShift) {
      if (this.state.rpm > 16800 && this.state.gear < 6) {
        this.state.gear++;
      } else if (this.state.rpm < 7000 && this.state.gear > 1 && this.state.speedMs < (this.effectiveTopSpeed * (this.state.gear / 7))) {
        this.state.gear--;
      }
    } else {
      if (input.shiftUp && this.state.gear < 6) this.state.gear++;
      if (input.shiftDown && this.state.gear > 1) this.state.gear--;
    }

    // 3. Acceleration & Aerodynamics
    const aeroCd = input.tuckIn ? 0.30 : 0.38;
    const dragForce = 0.5 * 1.225 * aeroCd * 0.65 * (this.state.speedMs * this.state.speedMs);
    const bikeMass = this.stats.weight;

    const gearPowerFactor = [0, 1.0, 0.93, 0.85, 0.78, 0.70, 0.64][this.state.gear];
    let driveAccel = input.throttle * this.effectiveAccel * gearPowerFactor * surfaceGrip;

    if (this.state.speedMs >= this.effectiveTopSpeed) {
      driveAccel = 0;
    }

    const netAccel = driveAccel - (dragForce / bikeMass);

    // 4. Braking Dynamics
    const frontBrakeForce = input.frontBrake * this.effectiveBraking * 0.75 * surfaceGrip;
    const rearBrakeForce = input.rearBrake * this.effectiveBraking * 0.25 * surfaceGrip;
    const totalBraking = frontBrakeForce + rearBrakeForce;

    // Trail braking limit: Heavy braking while leaned increases slide
    const currentLeanAbs = Math.abs(this.state.roll);
    if (input.frontBrake > 0.65 && currentLeanAbs > 0.8) {
      this.state.trailBrakingSlide = true;
      this.state.skidRatio = Math.min(1.0, this.state.skidRatio + dt * 3);
    } else {
      this.state.trailBrakingSlide = false;
      this.state.skidRatio = Math.max(0.0, this.state.skidRatio - dt * 4);
    }

    // Apply speed changes
    if (totalBraking > 0) {
      this.state.speedMs = Math.max(0, this.state.speedMs - totalBraking * dt);
    } else {
      this.state.speedMs = Math.max(0, this.state.speedMs + netAccel * dt);
    }

    // Off-track speed penalty in gravel
    if (this.state.isOffTrack && this.state.speedMs > 28) {
      this.state.speedMs = Math.max(28, this.state.speedMs - 35 * dt);
    }

    this.state.speedKmh = this.state.speedMs * 3.6;

    // 5. Steering & Motorcycle Leaning Dynamics
    // Speed-dependent stability
    const speedRatio = Math.min(this.state.speedMs / 45, 1.0);
    const steerAgility = this.effectiveHandling * (1.25 - speedRatio * 0.45);

    const targetSteer = input.steer * 0.32 * steerAgility;
    this.state.steerAngle = THREE.MathUtils.damp(this.state.steerAngle, targetSteer, 14, dt);

    // Turn rate (positive steer turns right)
    const turnRate = (this.state.speedMs > 0.5)
      ? (this.state.steerAngle * (this.state.speedMs * 0.08) * steerAgility)
      : 0;

    this.state.heading += turnRate * dt;

    // MotoGP Lean angle: theta = arctan(v * omega / g)
    // Positive roll leans right, negative leans left (up to 64° ~ 1.11 rad)
    const MAX_LEAN = 1.11;
    const lateralAccel = this.state.speedMs * turnRate;
    const calculatedLean = Math.atan(lateralAccel / 9.81);
    const targetRoll = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, calculatedLean));

    this.state.roll = THREE.MathUtils.damp(this.state.roll, targetRoll, 9, dt);

    // Knee scraping condition (leaning over 52° at speed)
    this.state.isScrapingKnee = Math.abs(this.state.roll) > 0.88 && this.state.speedKmh > 55 && !this.state.isOffTrack;

    // Suspension pitch: diving on brake, squatting on acceleration
    const targetPitch = totalBraking > 1 ? -0.06 * input.frontBrake : 0.04 * input.throttle;
    this.state.pitch = THREE.MathUtils.damp(this.state.pitch, targetPitch, 8, dt);

    // 6. Update Position in 3D Space (Forward is along -Z at heading = 0)
    const forwardX = Math.sin(this.state.heading);
    const forwardZ = -Math.cos(this.state.heading);

    this.state.velocity.set(forwardX * this.state.speedMs, 0, forwardZ * this.state.speedMs);
    this.state.position.x += this.state.velocity.x * dt;
    this.state.position.z += this.state.velocity.z * dt;
  }

  public setPosition(pos: THREE.Vector3, heading: number) {
    this.state.position.copy(pos);
    this.state.heading = heading;
    this.state.velocity.set(0, 0, 0);
    this.state.speedMs = 0;
    this.state.speedKmh = 0;
    this.state.roll = 0;
    this.state.pitch = 0;
  }
}
