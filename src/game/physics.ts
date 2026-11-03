import * as THREE from 'three';
import { BikeStats, BikeUpgrades, PlayerSettings } from '../types/game';
import { RaceConsumables } from './consumables';

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

// --- Powertrain -------------------------------------------------------------
// Total drive ratios chosen so 6th gear reaches the redline near the class
// top speed and 1st gives a proper launch band (the old ratios left the
// engine permanently below the upshift point, so the bike never changed gear).
const GEAR_RATIOS = [0, 6.60, 5.25, 4.30, 3.60, 3.10, 2.75];
const FINAL_DRIVE = 2.45;
const IDLE_RPM = 4200;
const REDLINE_RPM = 18000;
const MAX_RPM = 18500;
const WHEEL_RADIUS = 0.31;
const AUTO_UPSHIFT_RPM = 16800;
const AUTO_DOWNSHIFT_RPM = 7200;
const SHIFT_COOLDOWN_S = 0.25;      // manual quickshifter ignition cut
const TORQUE_SPIKE_FACTOR = 1.45;   // 1st/2nd-gear launch punch

// --- Chassis & tire model --------------------------------------------------
const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
const DRAG_FRONTAL_AREA = 0.65;     // m^2 (same as the original model)
const WHEELBASE = 1.45;             // m
const CG_HEIGHT = 0.48;             // m (bike + rider centre of mass)
const STATIC_FRONT_SHARE = 0.50;
const MAX_LEAN = 1.11;              // 64 degrees
const ENGINE_BRAKE = 0.5;           // m/s^2 at closed throttle

export class MotorcyclePhysics {
  public state: PhysicsState;
  private stats: BikeStats;
  private upgrades: BikeUpgrades;
  private settings: PlayerSettings;
  private autoShift: boolean;

  // Upgraded effective multipliers
  private effectiveTopSpeed: number;
  private effectiveAccel: number;
  private effectiveBraking: number;
  private effectiveHandling: number;
  private effectiveGrip: number;
  private aeroBonus: number;
  private staticFront: number;      // N static front-axle load

  // Race consumables: fuel load (adds to mass), tire wear (removes grip)
  // and brake temperature (fades brake power) — shared model with the AI.
  public consumables = new RaceConsumables();

  // Slipstream0..1: set by the race engine each frame when another rider
  // is towing us on a straight. Cuts drag and lifts the terminal-speed cap
  // by a few percent — a subtle tow, never a speed boost in corners.
  private draftFactor = 0;

  // Frame-to-frame transients
  private prevLongAccel = 0;        // m/s^2 measured chassis acceleration
  private prevMechFront = 0;        // N front load before aero share
  private shiftCooldownS = 0;
  private prevShiftUp = false;
  private prevShiftDown = false;
  private prevSteerInput = 0;
  private counterSteerTimer = 0;
  private counterSteerDir = 0;

  constructor(
    stats: BikeStats,
    upgrades: BikeUpgrades,
    initialPos: THREE.Vector3 = new THREE.Vector3(),
    initialHeading = 0,
    settings: PlayerSettings
  ) {
    this.stats = stats;
    this.upgrades = upgrades;
    this.settings = settings;
    this.autoShift = !settings.manualGearbox;

    // Upgrades calculation (0-5)
    const engBonus = 1 + upgrades.engine * 0.04;
    const brkBonus = 1 + upgrades.brakes * 0.045;
    const chsBonus = 1 + upgrades.chassis * 0.04;
    const tireBonus = 1 + upgrades.tires * 0.05;
    this.aeroBonus = 1 + upgrades.aero * 0.035;

    this.effectiveTopSpeed = (stats.topSpeed * engBonus * (1 + this.aeroBonus * 0.015)) / 3.6; // m/s
    this.effectiveAccel = (stats.acceleration / 100) * 13.0 * engBonus; // m/s^2
    this.effectiveBraking = (stats.braking / 100) * 17.5 * brkBonus;    // m/s^2
    this.effectiveHandling = (stats.handling / 100) * chsBonus;
    // Base friction coefficient: sized so straight-line braking demand still
    // fits inside the friction circle, while combined slip and lean falloff
    // do the limiting that used to be unlimited.
    this.effectiveGrip = 1.6 * tireBonus;
    this.staticFront =
      (stats.weight + this.consumables.fuelKg) * GRAVITY * STATIC_FRONT_SHARE;

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

    this.prevMechFront = this.staticFront;
  }

  public applySettings(settings: PlayerSettings) {
    this.settings = settings;
    this.autoShift = !settings.manualGearbox;
  }

  /** Updates the slipstream strength (0..1) for this frame. */
  public setDraft(factor: number): void {
    this.draftFactor = Math.max(0, Math.min(1, factor));
  }

  /** Current slipstream strength, for HUD/telemetry. */
  public get draft(): number {
    return this.draftFactor;
  }

  public update(input: RiderInput, delta: number, trackInfo?: { distToCenter: number; trackHalfWidth: number }): void {
    const dt = Math.min(delta, 0.05);
    // Wet mass: the fuel load is part of the bike until it is burned off,
    // so an early-race bike is heavier and transfers load harder than a
    // light one at the end of the race.
    const m = this.stats.weight + this.consumables.fuelKg;
    this.staticFront = m * GRAVITY * STATIC_FRONT_SHARE;
    const v = this.state.speedMs;

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

    // 2. Weight transfer from last frame's measured chassis acceleration:
    // accelerating unloads the front (squat/wheelie), braking loads it
    // (dive/stoppie).
    const staticTotal = m * GRAVITY;
    let mechFront =
      this.staticFront - (m * this.prevLongAccel * CG_HEIGHT) / WHEELBASE;
    mechFront = Math.min(Math.max(mechFront, 0), staticTotal);

    // Anti-wheelie aid: rate-limits how fast the front can unload and keeps
    // a small contact patch, so the nose rises but cannot sustain a full lift.
    if (this.settings.antiWheelie) {
      const maxDropPerSec = this.staticFront * 6;
      mechFront = Math.max(
        mechFront,
        this.prevMechFront - maxDropPerSec * dt,
        this.staticFront * 0.08
      );
    }
    this.prevMechFront = mechFront;

    // 3. Aerodynamics: drag (tuck lowers Cd, as before) plus downforce that
    // presses the tires into the track — tuck and aero upgrades add grip.
    // Riding in another rider's wake cuts the drag we have to push through.
    const dragCd = (input.tuckIn ? 0.30 : 0.38) * (1 - 0.25 * this.draftFactor);
    const dragDecel = (0.5 * AIR_DENSITY * dragCd * DRAG_FRONTAL_AREA * v * v) / m;
    const clA = (input.tuckIn ? 0.33 : 0.22) * this.aeroBonus;
    const downforce = 0.5 * AIR_DENSITY * clA * v * v;
    const normalTotal = staticTotal + downforce;

    // 4. Tire friction budget: combined normal load x friction coefficient.
    // Grip falls off toward maximum lean (contact patch limit) and with the
    // surface (kerbs, gravel).
    const leanRatio = Math.min(Math.abs(this.state.roll) / MAX_LEAN, 1);
    const leanGrip = 1 - 0.14 * leanRatio * leanRatio;
    // Worn tires shave grip off the whole friction circle.
    const mu =
      this.effectiveGrip * surfaceGrip * leanGrip * this.consumables.gripAvg;
    const budgetAccel = (mu * normalTotal) / m; // m/s^2 of combined tire force

    // 5. Steering with a countersteering transient: at speed, initiating a
    // lean means flicking the bars briefly away from the turn first.
    const speedRatio = Math.min(v / 45, 1.0);
    const steerAgility = this.effectiveHandling * (1.25 - speedRatio * 0.45);
    const steerInput = input.steer;
    if (
      v > 14 &&
      Math.abs(steerInput - this.prevSteerInput) > 0.05 &&
      Math.abs(steerInput) > 0.1
    ) {
      this.counterSteerTimer = 0.15;
      this.counterSteerDir = -Math.sign(steerInput);
    }
    this.prevSteerInput = steerInput;
    this.counterSteerTimer = Math.max(0, this.counterSteerTimer - dt);
    const counterSteer =
      this.counterSteerTimer > 0
        ? this.counterSteerDir *
          0.05 *
          (this.counterSteerTimer / 0.15) *
          Math.min(v / 35, 1)
        : 0;

    const steerTarget = steerInput * 0.32 * steerAgility + counterSteer;
    this.state.steerAngle = THREE.MathUtils.damp(this.state.steerAngle, steerTarget, 14, dt);

    // Turn rate from steer angle (same mapping the game has always used;
    // the friction circle below is what now limits it in reality).
    const turnRateCmd = v > 0.5 ? this.state.steerAngle * v * 0.08 * steerAgility : 0;
    // Lateral acceleration demanded by the steering input (m/s^2 — the same
    // domain as budgetAccel and tireLongDemand below, so the friction circle
    // compares like with like).
    const latDemand = v * turnRateCmd;

    // 6. Transmission, gearbox & traction control
    this.updateGearbox(input, dt, v);

    const gearPowerFactor = [0, 1.0, 0.95, 0.91, 0.88, 0.86, 0.84][this.state.gear];
    let driveAccel =
      input.throttle *
      this.effectiveAccel *
      gearPowerFactor *
      surfaceGrip *
      this.consumables.gripRear;
    // Slipstream extends the terminal-speed cap by up to ~3.5% in the tow.
    if (v >= this.effectiveTopSpeed * (1 + 0.035 * this.draftFactor)) driveAccel = 0;
    // Short-gear launch punch: with the aids disabled this is what lifts the
    // front wheel out of slow corners.
    if (input.throttle > 0.9 && this.state.gear <= 2 && v < 20) {
      driveAccel *= TORQUE_SPIKE_FACTOR;
    }
    // Manual quickshifter ignition cut between shifts
    if (!this.autoShift && this.shiftCooldownS > 0) driveAccel = 0;

    let driveForce = driveAccel * m;
    // Traction control (tcsLevel 0 = off, 1 = medium, 2 = full) caps drive
    // force against the rear tire's share of the grip budget.
    if (this.settings.tcsLevel > 0 && input.throttle > 0.1) {
      const rearLoad = normalTotal - (mechFront + downforce * 0.5);
      const rearGrip = (mu * Math.max(rearLoad, 0)) / m;
      const tcCap = this.settings.tcsLevel >= 2 ? 0.78 : 0.95;
      driveForce = Math.min(driveForce, tcCap * rearGrip * m);
    }

    // 7. Braking demand (front/rear split as before). Hot brakes fade:
    // the same lever input produces less deceleration as rotors heat up.
    const brakeAccel =
      (input.frontBrake * this.effectiveBraking * 0.75 +
        input.rearBrake * this.effectiveBraking * 0.25) *
      surfaceGrip *
      this.consumables.brakeScale;
    const tireLongDemand = driveForce / m - brakeAccel;

    // 8. Friction circle: braking/acceleration and cornering share one grip
    // budget — trail braking eats cornering grip, and vice versa.
    const longUseRaw = Math.min(Math.abs(tireLongDemand) / budgetAccel, 1);
    const latAvail = budgetAccel * Math.sqrt(Math.max(0, 1 - longUseRaw * longUseRaw));
    const latActual = THREE.MathUtils.clamp(latDemand, -latAvail, latAvail);
    const latUse = Math.min(Math.abs(latActual) / budgetAccel, 1);
    const longAvail = budgetAccel * Math.sqrt(Math.max(0, 1 - latUse * latUse));
    const tireLongActual = THREE.MathUtils.clamp(tireLongDemand, -longAvail, longAvail);

    // Path curvature from the grip-limited lateral acceleration: when the
    // rider demands more than the tires can give, the bike turns less
    // (understeer/slide) instead of magically following the input.
    const turnRate = v > 0.5 ? latActual / v : 0;
    this.state.heading += turnRate * dt;

    // 9. Longitudinal integration (drag and engine braking act on the
    // chassis, not through the tire circle)
    const engineBrake = (1 - input.throttle) * ENGINE_BRAKE;
    const moving = v > 0.05 ? 1 : 0;
    const newSpeed = Math.max(
      0,
      v + (tireLongActual - moving * (dragDecel + engineBrake)) * dt
    );
    this.prevLongAccel = dt > 0
      ? THREE.MathUtils.clamp((newSpeed - v) / dt, -30, 30)
      : 0;
    this.state.speedMs = newSpeed;
    this.state.speedKmh = newSpeed * 3.6;

    // Off-track speed penalty in gravel
    if (this.state.isOffTrack && this.state.speedMs > 28) {
      this.state.speedMs = Math.max(28, this.state.speedMs - 35 * dt);
      this.state.speedKmh = this.state.speedMs * 3.6;
    }

    // 10. Skid / slide model: tires slide when the rider demands more than
    // the friction circle allows (wheel spin, lock-up, or cornering slide).
    const latExcess =
      Math.abs(latDemand) > latAvail
        ? (Math.abs(latDemand) - latAvail) / budgetAccel
        : 0;
    const longExcess =
      Math.abs(tireLongDemand) > longAvail
        ? (Math.abs(tireLongDemand) - longAvail) / budgetAccel
        : 0;
    let skidTarget = Math.min(1, Math.max(latExcess, longExcess) * 1.8);

    // Trail braking at lean: heavy front brake while deeply leaned keeps the
    // original slide behaviour (audio/haptics/hud depend on this signal).
    this.state.trailBrakingSlide =
      input.frontBrake > 0.65 && Math.abs(this.state.roll) > 0.8;
    if (this.state.trailBrakingSlide) {
      skidTarget = Math.max(skidTarget, Math.min(1, this.state.skidRatio + dt * 3));
    }
    if (skidTarget > this.state.skidRatio) {
      this.state.skidRatio = Math.min(skidTarget, this.state.skidRatio + dt * 3.5);
    } else {
      this.state.skidRatio = Math.max(skidTarget, this.state.skidRatio - dt * 4);
    }

    // 10b. Race consumables: burn fuel under load, scrub tires against the
    // grip circle just used, and heat the brakes under brake demand.
    this.consumables.update(dt, {
      throttle: input.throttle,
      brake: input.frontBrake * 0.75 + input.rearBrake * 0.25,
      speedMs: v,
      latUtil: Math.min(Math.abs(latDemand) / budgetAccel, 1),
      longUtil: longUseRaw,
      leanRatio,
      skidRatio: this.state.skidRatio,
    });

    // 11. Lean angle from the corner the rider is actually requesting
    // (theta = arctan(v * omega / g), clamped to the MotoGP lean limit)
    const latAccelCmd = v * turnRateCmd;
    const targetRoll = Math.max(
      -MAX_LEAN,
      Math.min(MAX_LEAN, Math.atan(latAccelCmd / GRAVITY))
    );
    this.state.roll = THREE.MathUtils.damp(this.state.roll, targetRoll, 9, dt);

    // Knee scraping condition (leaning over 52° at speed)
    this.state.isScrapingKnee =
      Math.abs(this.state.roll) > 0.88 && this.state.speedKmh > 55 && !this.state.isOffTrack;

    // Suspension attitude from real load transfer: dive, squat, wheelie, stoppie
    this.state.pitch = THREE.MathUtils.damp(
      this.state.pitch,
      this.computePitch(mechFront, downforce),
      9,
      dt
    );

    // 12. Update Position in 3D Space (Forward is along -Z at heading = 0)
    const forwardX = Math.sin(this.state.heading);
    const forwardZ = -Math.cos(this.state.heading);

    this.state.velocity.set(forwardX * this.state.speedMs, 0, forwardZ * this.state.speedMs);
    this.state.position.x += this.state.velocity.x * dt;
    this.state.position.z += this.state.velocity.z * dt;
  }

  /**
   * Suspension attitude: braking dive / acceleration squat straight from the
   * load transfer, deepening into a stoppie when the rear unloads or a
   * wheelie when the front does. Downforce pins both wheels at high speed,
   * so the dramatic angles only appear at lower speeds where they belong.
   */
  private computePitch(mechFront: number, downforce: number): number {
    const staticTotal = (this.stats.weight + this.consumables.fuelKg) * GRAVITY;
    const mechRatio = mechFront / this.staticFront; // 1 = static, 0 = airborne
    const frontWithAero = mechFront + downforce * 0.5;
    const rearWithAero = staticTotal - mechFront + downforce * 0.5;

    let targetPitch: number;
    if (mechRatio >= 1) {
      // Braking dive; the rear-lift (stoppie) zone deepens it
      targetPitch = -0.10 * Math.min(mechRatio - 1, 1.4);
      const rearAeroRatio = rearWithAero / this.staticFront;
      if (rearAeroRatio < 0.25) {
        targetPitch -= 0.18 * (1 - rearAeroRatio / 0.25);
      }
    } else {
      // Acceleration squat; the front-lift (wheelie) zone deepens it
      targetPitch = 0.09 * (1 - mechRatio);
      const frontAeroRatio = frontWithAero / this.staticFront;
      if (frontAeroRatio < 0.2) {
        targetPitch += 0.16 * (1 - frontAeroRatio / 0.2);
      }
    }
    return targetPitch;
  }

  /**
   * RPM model plus automatic or manual shifting. Manual mode consumes the
   * edge-triggered shiftUp/shiftDown inputs with a quickshifter cooldown;
   * automatic mode shifts on rpm bands (the old rpm scale never reached the
   * upshift point, so automatic bikes never left 1st gear).
   */
  private updateGearbox(input: RiderInput, dt: number, v: number): void {
    const wheelCircumference = 2 * Math.PI * WHEEL_RADIUS;
    const currentRatio = GEAR_RATIOS[this.state.gear] * FINAL_DRIVE;
    const calculatedRpm = (v / wheelCircumference) * currentRatio * 60;
    this.state.rpm = Math.max(
      IDLE_RPM,
      Math.min(calculatedRpm + (input.throttle > 0 ? 1200 * input.throttle : 0), MAX_RPM)
    );
    this.state.isLimiter = this.state.rpm >= REDLINE_RPM;

    if (this.autoShift) {
      if (this.state.rpm > AUTO_UPSHIFT_RPM && this.state.gear < 6) {
        this.state.gear++;
      } else if (this.state.rpm < AUTO_DOWNSHIFT_RPM && this.state.gear > 1) {
        this.state.gear--;
      }
      return;
    }

    // Manual quickshifter: edge-triggered, one shift per press
    this.shiftCooldownS = Math.max(0, this.shiftCooldownS - dt);
    const upEdge = !!input.shiftUp && !this.prevShiftUp;
    const downEdge = !!input.shiftDown && !this.prevShiftDown;
    this.prevShiftUp = !!input.shiftUp;
    this.prevShiftDown = !!input.shiftDown;

    if (this.shiftCooldownS === 0) {
      if (upEdge && this.state.gear < 6) {
        this.state.gear++;
        this.shiftCooldownS = SHIFT_COOLDOWN_S;
      } else if (downEdge && this.state.gear > 1) {
        this.state.gear--;
        this.shiftCooldownS = SHIFT_COOLDOWN_S;
      }
    }
  }

  public setPosition(pos: THREE.Vector3, heading: number) {
    // A restart is a fresh race: full tank, fresh tires, cold brakes.
    this.consumables.reset();
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
    this.state.isLimiter = false;
    this.state.skidRatio = 0;
    this.state.trailBrakingSlide = false;
    this.draftFactor = 0;

    // Clear transients so a restart launches cleanly
    this.prevLongAccel = 0;
    this.prevMechFront = this.staticFront;
    this.shiftCooldownS = 0;
    this.prevShiftUp = false;
    this.prevShiftDown = false;
    this.prevSteerInput = 0;
    this.counterSteerTimer = 0;
    this.counterSteerDir = 0;
  }
}
