/**
 * Race consumables — fuel load, tire wear and brake temperature — shared by
 * the player's physics and the AI controllers. One implementation means the
 * player and the AI degrade identically over a race distance: no hidden
 * rubber-band advantage, and the rider's tire/brake management actually
 * matters from the start of the race to the chequered flag.
 *
 * All of this state is per-race runtime state; nothing here is persisted,
 * so existing saves are unaffected.
 */

export const FUEL_CAPACITY_KG = 16;

// Fuel burn (kg/s). Sized so even the longest race leaves fuel in the tank —
// running dry is not a race strategy in this game, only weight management.
const FUEL_BURN_FULL_THROTTLE = 0.0095;
const FUEL_BURN_IDLE = 0.0011;

// Tire wear rates (fraction of tire life per second). Base scrub plus a
// workload term from how much of the grip circle is being used, plus an
// expensive term for outright sliding.
const REAR_WEAR_BASE = 0.00008;
const REAR_WEAR_SLIP = 0.00075;
const FRONT_WEAR_BASE = 0.00007;
const FRONT_WEAR_SLIP = 0.00070;
const FRONT_WEAR_LEAN = 0.00030; // deep lean spends the front shoulder
const WEAR_SKID = 0.00130;       // sliding is the fastest way to destroy a tire
const GRIP_LOSS_PER_WEAR = 0.15; // each tire loses up to 15% of its grip fully worn
const MIN_TIRE_GRIP = 0.55;

// Brake temperature (0 = cold, 1 = glowing). Heat comes from brake demand at
// speed; cooling comes from airflow, so fades strike during a stint of
// repeated hard braking and recover on the straights.
const BRAKE_HEAT = 0.50;
const BRAKE_COOL_STILL = 0.10;
const BRAKE_COOL_AIR = 0.14;
const BRAKE_FADE_START = 0.55;
const BRAKE_FADE_MAX = 0.45; // up to 45% brake power lost when fully hot

export interface ConsumablesSample {
  throttle: number;   // 0..1
  brake: number;      // combined brake demand 0..1
  speedMs: number;
  latUtil: number;    // lateral grip usage this frame 0..1
  longUtil: number;   // longitudinal grip usage this frame 0..1
  leanRatio: number;  // |lean| / max lean, 0..1
  skidRatio: number;  // 0..1
}

export class RaceConsumables {
  public fuelKg = FUEL_CAPACITY_KG;
  public wearFront = 0; // 0 = fresh, 1 = destroyed
  public wearRear = 0;
  public brakeTemp = 0; // 0 = cold, 1 = glowing

  /** Refuel, fit fresh tires and let the brakes cool — a race restart. */
  public reset(): void {
    this.fuelKg = FUEL_CAPACITY_KG;
    this.wearFront = 0;
    this.wearRear = 0;
    this.brakeTemp = 0;
  }

  /** Front tire grip multiplier from wear (0.55 .. 1). */
  public get gripFront(): number {
    return Math.max(MIN_TIRE_GRIP, 1 - GRIP_LOSS_PER_WEAR * this.wearFront);
  }

  /** Rear tire grip multiplier from wear (0.55 .. 1). */
  public get gripRear(): number {
    return Math.max(MIN_TIRE_GRIP, 1 - GRIP_LOSS_PER_WEAR * this.wearRear);
  }

  /** Average tire condition — what the combined-slip friction circle uses. */
  public get gripAvg(): number {
    return 0.5 * (this.gripFront + this.gripRear);
  }

  /** Brake power multiplier from pad/rotor temperature (0.55 .. 1). */
  public get brakeScale(): number {
    if (this.brakeTemp <= BRAKE_FADE_START) return 1;
    const overheat = (this.brakeTemp - BRAKE_FADE_START) / (1 - BRAKE_FADE_START);
    return 1 - BRAKE_FADE_MAX * overheat;
  }

  public update(dt: number, s: ConsumablesSample): void {
    // Fuel: idle burn plus throttle load scaled by how hard the bike works.
    const speedLoad = Math.min(s.speedMs / 45, 1);
    const burn =
      FUEL_BURN_IDLE + FUEL_BURN_FULL_THROTTLE * s.throttle * (0.35 + 0.65 * speedLoad);
    this.fuelKg = Math.max(0, this.fuelKg - burn * dt);

    // Tire wear: scrub + grip-circle workload + sliding penalty.
    const util = Math.min(1, s.latUtil + s.longUtil);
    const lean = Math.min(1, s.leanRatio * s.leanRatio);
    const skid = Math.min(1, Math.max(0, s.skidRatio));
    this.wearRear = Math.min(
      1,
      this.wearRear + dt * (REAR_WEAR_BASE + REAR_WEAR_SLIP * util + WEAR_SKID * skid)
    );
    this.wearFront = Math.min(
      1,
      this.wearFront +
        dt * (FRONT_WEAR_BASE + FRONT_WEAR_SLIP * util + FRONT_WEAR_LEAN * lean + WEAR_SKID * skid * 0.8)
    );

    // Brake temperature: heat from demand at speed, cooling from airflow.
    const speedRatio = Math.min(Math.max(s.speedMs, 0) / 45, 1);
    const heatIn = Math.min(Math.max(s.brake, 0), 1) * BRAKE_HEAT * (0.25 + 0.75 * speedRatio);
    const coolOut = this.brakeTemp * (BRAKE_COOL_STILL + BRAKE_COOL_AIR * speedRatio);
    this.brakeTemp = Math.min(1, Math.max(0, this.brakeTemp + (heatIn - coolOut) * dt));
  }
}
