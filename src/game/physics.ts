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

/** Rider aids taken from the player's saved settings. */
export interface RiderAssists {
  tcsLevel: number;      // 0 = off, 1 = medium, 2 = maximum
  antiWheelie: boolean;
}

// Gear ratios for 1000cc MotoGP prototype
const GEAR_RATIOS = [0, 2.65, 2.10, 1.72, 1.45, 1.25, 1.10];
const FINAL_DRIVE = 2.45;
const IDLE_RPM = 4200;
const REDLINE_RPM = 18000;
const MAX_RPM = 18500;
const UPSHIFT_RPM = 16800;
const DOWNSHIFT_RPM = 7000;
const PEAK_TORQUE_RPM = 11500;
const TORQUE_FLOOR = 0.45;        // fraction of peak torque at 3000 rpm

// Vehicle constants (typical 1000cc MotoGP prototype with rider)
const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
const RIDER_MASS = 70;           // kg - BikeStats.weight is the bike alone
const WHEEL_RADIUS = 0.31;
const WHEELBASE = 1.46;           // m
const CG_HEIGHT = 0.55;           // m - bike plus rider sits high
const STATIC_FRONT_SHARE = 0.50;  // share of static weight on the front wheel
const DRIVE_EFFICIENCY = 0.92;
const MAX_LEAN = 1.11;            // rad (~64 degrees) - hard chassis limit
const MIN_FRONT_LOAD = 90;        // N - anti-wheelie keeps the front this heavy
const ENGINE_BRAKE_DECEL = 1.5;   // m/s^2 at closed throttle, 1st gear

const DEFAULT_ASSISTS: RiderAssists = { tcsLevel: 1, antiWheelie: true };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class MotorcyclePhysics {
  public state: PhysicsState;
  private stats: BikeStats;
  private autoShift: boolean;
  private assists: RiderAssists;

  // Upgraded effective values
  private effectiveTopSpeed: number;  // m/s
  private powerW: number;
  private peakTorque: number;         // Nm at the crank
  private maxBrakeForce: number;      // N at the contact patches
  private steerGain: number;
  private gripBase: number;           // peak tire friction coefficient

  // Aero
  private dragArea: number;           // Cd x A, drag-limited top speed calibration
  private liftArea: number;           // Cl x A, downforce

  // Dynamics carried between frames
  private prevAx = 0;                 // longitudinal acceleration of the previous frame
  private pitchRate = 0;
  private steerDyn = 0;
  private rollTarget = 0;
  private lateralSlide = 0;           // 0 to 1, over the cornering limit
  private driveSlip = 0;              // 0 to 1, rear tire spin demand
  private tireTempC = 74;             // degrees, starts cool like an out lap
  private tireWear = 0;               // 0 to 1

  constructor(
    stats: BikeStats,
    upgrades: BikeUpgrades,
    initialPos: THREE.Vector3 = new THREE.Vector3(),
    initialHeading = 0,
    autoShift = true,
    assists: RiderAssists = DEFAULT_ASSISTS
  ) {
    this.stats = stats;
    this.autoShift = autoShift;
    this.assists = { ...DEFAULT_ASSISTS, ...assists };

    // Upgrades calculation (0-5)
    const engBonus = 1 + upgrades.engine * 0.04;
    const brkBonus = 1 + upgrades.brakes * 0.045;
    const chsBonus = 1 + upgrades.chassis * 0.04;
    const tireBonus = 1 + upgrades.tires * 0.05;
    const aeroBonus = 1 + upgrades.aero * 0.035;

    this.effectiveTopSpeed = (stats.topSpeed * engBonus * (1 + aeroBonus * 0.015)) / 3.6; // m/s
    this.powerW = stats.power * 745.7 * engBonus;
    this.peakTorque = (this.powerW / ((2 * Math.PI * PEAK_TORQUE_RPM) / 60)) * (stats.acceleration / 86);
    this.maxBrakeForce = (stats.braking / 100) * 24.0 * brkBonus * (stats.weight + RIDER_MASS);
    this.steerGain = 0.85 + (stats.handling / 100) * chsBonus * 0.35;
    this.gripBase = 1.4 * tireBonus;

    // Drag is calibrated so that peak power, the aero drag and the quoted top
    // speed balance exactly: eta * P = 0.5 * rho * CdA * v^3
    this.dragArea = clamp(
      (2 * DRIVE_EFFICIENCY * this.powerW) /
        (AIR_DENSITY * Math.pow(this.effectiveTopSpeed, 3)),
      0.10,
      0.90
    );
    this.liftArea = 0.085 * (1 + (aeroBonus - 1) * 3);

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

  /** Torque curve: rising to peak at PEAK_TORQUE_RPM, then flat power above it. */
  private torqueFraction(rpm: number): number {
    if (rpm <= PEAK_TORQUE_RPM) {
      const t = clamp((rpm - 3000) / (PEAK_TORQUE_RPM - 3000), 0, 1);
      return TORQUE_FLOOR + (1 - TORQUE_FLOOR) * t;
    }
    return Math.max(0.35, PEAK_TORQUE_RPM / rpm);
  }

  /** Grip of a hot, unworn tire is 1.0; cold or overheated rubber is worth less. */
  private tireCondition(): number {
    const temp = this.tireTempC;
    let factor = 1;
    if (temp < 82) factor = clamp(0.88 + (temp - 55) * (0.12 / 27), 0.88, 1);
    else if (temp > 112) factor = clamp(1 - (temp - 112) * (0.16 / 40), 0.84, 1);
    return factor * (1 - this.tireWear * 0.1);
  }

  public update(input: RiderInput, delta: number, trackInfo?: { distToCenter: number; trackHalfWidth: number }): void {
    const dt = Math.min(delta, 0.05);
    const speed = this.state.speedMs;
    const mass = this.stats.weight + RIDER_MASS;

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

    // 2. Aerodynamics: drag pushes back, downforce presses the tires into the road
    //    (tucking shrinks the frontal area and raises the top speed)
    const dragAreaScale = input.tuckIn ? 0.92 : 1.12;
    const downforceScale = input.tuckIn ? 1.0 : 0.82;
    const dragForce = 0.5 * AIR_DENSITY * this.dragArea * dragAreaScale * speed * speed;
    const downforce = 0.5 * AIR_DENSITY * this.liftArea * downforceScale * speed * speed;

    // 3. Vertical loads: static split + aero + longitudinal weight transfer
    const staticFront = STATIC_FRONT_SHARE * mass * GRAVITY;
    const staticRear = (1 - STATIC_FRONT_SHARE) * mass * GRAVITY;
    const transfer = (mass * this.prevAx * CG_HEIGHT) / WHEELBASE;
    const frontLoad = Math.max(0, staticFront + downforce * 0.55 - transfer);
    const rearLoad = Math.max(0, staticRear + downforce * 0.45 + transfer);
    const totalLoad = frontLoad + rearLoad;

    const tireGrip = this.gripBase * surfaceGrip * this.tireCondition();

    // 4. Transmission & RPM Logic
    const currentRatio = GEAR_RATIOS[this.state.gear] * FINAL_DRIVE;
    const wheelCircumference = 2 * Math.PI * WHEEL_RADIUS;
    const calculatedRpm = (speed / wheelCircumference) * currentRatio * 60;
    this.state.rpm = Math.max(IDLE_RPM, Math.min(calculatedRpm + (input.throttle > 0 ? 1200 * input.throttle : 0), MAX_RPM));
    // Standing starts slip the clutch, which holds the engine high in its
    // torque curve while the bike is still walking away from the line.
    if (this.state.gear === 1 && speed < 14 && input.throttle > 0.2) {
      this.state.rpm = Math.max(this.state.rpm, 9500);
    }
    this.state.isLimiter = this.state.rpm >= REDLINE_RPM;

    // Automatic Quickshifter
    if (this.autoShift) {
      if (this.state.rpm > UPSHIFT_RPM && this.state.gear < 6 && input.throttle > 0.1) {
        this.state.gear++;
      } else if (
        this.state.rpm < DOWNSHIFT_RPM &&
        this.state.gear > 1 &&
        speed < (this.effectiveTopSpeed * this.state.gear) / 7
      ) {
        this.state.gear--;
      }
    } else {
      if (input.shiftUp && this.state.gear < 6) this.state.gear++;
      if (input.shiftDown && this.state.gear > 1) this.state.gear--;
    }

    // 5. Drive force from the engine, limited by traction and the anti-wheelie aid
    const torqueAtEngine = this.peakTorque * this.torqueFraction(this.state.rpm);
    const driveDemand = (input.throttle * torqueAtEngine * currentRatio * DRIVE_EFFICIENCY) / WHEEL_RADIUS;

    // Traction control: a spinning rear tire transmits less force than one on
    // the edge of adhesion, so with TCS off mashing the throttle costs grip.
    const peakRear = tireGrip * rearLoad;
    const tcsLevel = clamp(Math.round(this.assists.tcsLevel), 0, 2);
    const tractionCap = peakRear * [1.0, 1.0, 0.92][tcsLevel];
    let driveForce = Math.min(driveDemand, tractionCap);
    if (tcsLevel === 0 && driveDemand > peakRear) {
      const over = clamp(driveDemand / Math.max(1, peakRear) - 1, 0, 1);
      driveForce = peakRear * (1 - 0.18 * over);
      this.driveSlip = over;
    } else {
      this.driveSlip = 0;
    }

    // 6. Brakes: each wheel may only use the grip it is actually loaded with
    const brakeDemand = this.maxBrakeForce;
    const frontBrakeForce = Math.min(input.frontBrake * brakeDemand * 0.72, tireGrip * frontLoad);
    const rearBrakeDemand = input.rearBrake * brakeDemand * 0.28;
    const engineBrake =
      input.throttle > 0.05 ? 0 : mass * ENGINE_BRAKE_DECEL * (currentRatio / (GEAR_RATIOS[1] * FINAL_DRIVE));
    const rearBrakeForce = Math.min(rearBrakeDemand + engineBrake, tireGrip * rearLoad);
    const brakeForce = frontBrakeForce + rearBrakeForce;

    // Anti-wheelie: opening the throttle hard lightens the front, so the aid
    // trims drive force until the front wheel keeps enough load to stay down.
    const frontBudget = staticFront + downforce * 0.55;
    if (this.assists.antiWheelie) {
      const maxDrive =
        ((frontBudget - MIN_FRONT_LOAD) * WHEELBASE) / CG_HEIGHT + brakeForce + dragForce;
      driveForce = Math.min(driveForce, Math.max(0, maxDrive));
    }

    // 7. Longitudinal acceleration
    const longForce = driveForce - brakeForce - dragForce;
    let ax = longForce / mass;

    // Front wheel lift: only reachable with the anti-wheelie aid switched off
    const predictedFront = frontBudget - (ax * mass * CG_HEIGHT) / WHEELBASE;
    const wheelie = predictedFront < 0 ? clamp(-predictedFront / staticFront, 0, 1) * 0.30 : 0;

    if (this.state.isOffTrack && speed > 28) {
      ax = Math.min(ax, -35);
    }

    this.state.speedMs = Math.max(0, speed + ax * dt);
    this.prevAx = ax;
    this.state.speedKmh = this.state.speedMs * 3.6;

    // 8. Friction circle: whatever the tires are using for drive or braking is
    //    grip they cannot spare for cornering.
    const gripForce = tireGrip * totalLoad;
    const longUtil = gripForce > 0 ? clamp(Math.abs(longForce) / gripForce, 0, 1) : 0;
    const lateralBudget = Math.max(1.5, gripForce * Math.sqrt(Math.max(0.04, 1 - longUtil * longUtil)) / mass);

    // Steering: full lock asks for exactly the available cornering force, so the
    // input reads as a fraction of the tire's grip at every speed.
    const speedRef = clamp(this.state.speedMs, 6, 120);
    const maxSteer = clamp(
      (lateralBudget * WHEELBASE * this.steerGain) / (speedRef * speedRef),
      0.035,
      0.5
    );
    const steerTarget = input.steer * maxSteer;
    this.steerDyn = THREE.MathUtils.damp(this.steerDyn, steerTarget, 14, dt);

    // Countersteer: the bars briefly point away from the corner to start the
    // lean, then settle back into the turn.
    const countersteer = clamp(this.rollTarget - this.state.roll, -1, 1) * maxSteer * 0.45;
    this.state.steerAngle = clamp(this.steerDyn - countersteer, -0.6, 0.6);

    // Cornering force, limited by the friction circle
    const curvature = Math.tan(clamp(this.steerDyn, -0.6, 0.6)) / WHEELBASE;
    const aLatReq = this.state.speedMs * this.state.speedMs * curvature;
    const aLatMax = lateralBudget;
    const aLat = clamp(aLatReq, -aLatMax, aLatMax);
    this.lateralSlide = clamp(Math.abs(aLatReq) / aLatMax - 1, 0, 1);

    // Sliding past the limit scrubs speed off the bike
    if (this.lateralSlide > 0 && this.state.speedMs > 2) {
      const scrub = Math.min(this.lateralSlide * aLatMax * 0.4, 6);
      this.state.speedMs = Math.max(0, this.state.speedMs - scrub * dt);
      this.state.speedKmh = this.state.speedMs * 3.6;
    }

    const turnRate = this.state.speedMs > 0.5 ? aLat / this.state.speedMs : 0;
    this.state.heading += turnRate * dt;

    // 9. Roll dynamics: the chassis leans to balance the cornering force
    this.rollTarget = clamp(Math.atan2(aLat, GRAVITY), -MAX_LEAN, MAX_LEAN);
    this.state.roll = THREE.MathUtils.damp(this.state.roll, this.rollTarget, 7, dt);

    // Knee scraping condition (leaning over 52 degrees at speed)
    this.state.isScrapingKnee =
      Math.abs(this.state.roll) > 0.88 && this.state.speedKmh > 55 && !this.state.isOffTrack;

    // 10. Suspension: weight transfer dives the forks and squats the shock
    const targetPitch = clamp(ax * 0.0055, -0.075, 0.055);
    this.pitchRate += ((targetPitch - this.state.pitch) * 90 - this.pitchRate * 13) * dt;
    const suspPitch = clamp(this.state.pitch + this.pitchRate * dt, -0.09, 0.055);
    this.state.pitch = clamp(suspPitch + wheelie, -0.09, 0.35);

    // 11. Tire condition: heat and wear build with the work the tires are doing
    const utilization = Math.max(
      Math.abs(aLat) / Math.max(aLatMax, 1),
      this.driveSlip,
      longUtil
    );
    const targetTemp = 74 + 44 * clamp(utilization, 0, 1);
    const tempRate = 0.35 + 1.1 * clamp(utilization, 0, 1);
    this.tireTempC += (targetTemp - this.tireTempC) * Math.min(1, tempRate * dt);
    this.tireWear = clamp(this.tireWear + dt * (0.0004 + 0.006 * utilization * utilization), 0, 1);

    // 12. Tire effects reported to audio, sparks and haptics
    const slideTarget = Math.max(this.lateralSlide * 0.9, this.driveSlip * 0.75);
    if (slideTarget > this.state.skidRatio) {
      this.state.skidRatio = Math.min(1, this.state.skidRatio + dt * 3);
    } else {
      this.state.skidRatio = Math.max(0, this.state.skidRatio - dt * 4);
    }

    // Trail braking limit: heavy braking while leaned increases slide
    const currentLeanAbs = Math.abs(this.state.roll);
    if (input.frontBrake > 0.65 && currentLeanAbs > 0.8) {
      this.state.trailBrakingSlide = true;
      this.state.skidRatio = Math.min(1.0, this.state.skidRatio + dt * 2);
    } else {
      this.state.trailBrakingSlide = false;
    }

    // 13. Update position in 3D space (Forward is along -Z at heading = 0)
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
    this.state.steerAngle = 0;
    this.state.gear = 1;
    this.state.rpm = IDLE_RPM;
    this.state.skidRatio = 0;
    this.state.trailBrakingSlide = false;
    this.prevAx = 0;
    this.pitchRate = 0;
    this.steerDyn = 0;
    this.rollTarget = 0;
    this.lateralSlide = 0;
    this.driveSlip = 0;
    this.tireTempC = 74;
    this.tireWear = 0;
  }
}
