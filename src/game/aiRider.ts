import * as THREE from 'three';
import { AIDifficulty, RiderProfile, RiderRaceState } from '../types/game';
import { MOTORCYCLES } from '../data/bikes';
import { buildMotorcycle, BuiltBike } from './bikeBuilder';
import { BuiltTrack } from './trackBuilder';
import { RaceConsumables, FUEL_CAPACITY_KG } from './consumables';
import {
  RacingLineData,
  lineIndexAt,
  radiusAt,
  cornerDirAt,
  isStraightAt,
  RADIUS_STRAIGHT,
} from './racingLine';
import {
  derivePersonality,
  DifficultyProfile,
  DIFFICULTY_PROFILES,
  RiderPersonality,
} from './aiPersonality';

/**
 * Per-frame snapshot of every rider, built once by the racing engine into a
 * reused buffer (no per-frame allocation). The AI reads this for overtaking,
 * defense, side-by-side spacing and slipstream decisions.
 */
export interface RiderContext {
  id: string;
  isPlayer: boolean;
  position: THREE.Vector3; // live reference — read-only for AI
  heading: number;
  speedMs: number;
  raceDistance: number; // monotonic meters covered (classification metric)
  splineProgress: number; // 0..1 around the lap
  lateralOffset: number; // signed meters from centerline
  finished: boolean;
}

export interface AIUpdateEnv {
  track: BuiltTrack;
  line: RacingLineData;
  riders: RiderContext[];
  selfIndex: number;
  raceActive: boolean;
  raceTimeMs: number;
  totalLaps: number;
  difficulty: DifficultyProfile;
}

/** How far ahead (m) the AI scans precomputed radius for braking. Must
 *  cover the longest realistic braking zone from top speed (~360 m at
 *  EASY's early-commit margin) plus corner length. */
const MAX_SCAN_M = 650;
/** Near field (m): a corner complex within this range keeps the braking
 *  commitment alive after the current binding sample is passed — the
 *  window must cover a full braking zone, not just the apex. */
const NEAR_SCAN_M = 250;
/** Keep this many meters of asphalt under the bike before the grass. */
const EDGE_MARGIN = 0.55;
/** Minimum lateral gap when two bikes overlap longitudinally. */
const SIDE_BY_SIDE_SEP = 2.7;
/** Lateral offset beside an overtaking target. */
const OVERTAKE_LATERAL = 3.1;
/** Longitudinal window (m) where line-occupation matters. */
const OCCUPY_WINDOW_M = 10;

// Hot-path scratch vectors: module-level, never retained between calls.
const SCRATCH_PT = new THREE.Vector3();
const SCRATCH_TANG = new THREE.Vector3();
const SCRATCH_TANG2 = new THREE.Vector3();
const SCRATCH_FINAL = new THREE.Vector3();

/**
 * Slipstream strength for a following rider: peaks in the tow zone a few
 * meters behind the leader, fades by ~26 m, and mostly disappears off-line.
 */
export function computeDraftFactor(
  gapM: number,
  lateralDiff: number,
  isStraight: boolean
): number {
  if (!(gapM > 1) || gapM > 26) return 0;
  const gapFactor = Math.max(0, Math.min(1, 1 - (gapM - 3) / 20));
  const latFactor = lateralDiff < 1.8 ? 1 : lateralDiff < 4 ? 0.4 : 0;
  return gapFactor * latFactor * (isStraight ? 1 : 0.35);
}

type MistakeKind = 'late_brake' | 'wide' | 'slow_exit';

export class AIRiderController {
  public profile: RiderProfile;
  public bike: BuiltBike;
  public raceState: RiderRaceState;

  // Personality is derived once from the roster values and never changes —
  // it is what makes every rider behave differently.
  public personality: RiderPersonality;

  // AI navigation variables
  public progress = 0; // 0.0 to 1.0 along spline
  public lateralOffset = 0;
  public speedMs = 0;
  public heading = 0;
  public leanAngle = 0;
  public gear = 1;
  public rpm = 4200;

  // Race progression tracking
  public completedLaps = 0;
  private unwrappedProgress = 0;
  private prevProgress = 0;
  private startLinePending = true;
  private lapStartRaceTimeMs = 0;

  private topSpeedMs: number;
  private maxAccel: number;
  private maxBraking: number;
  private targetSpeedMs = 0;

  // Same consumables model as the player (fuel, tire wear, brake fade).
  public consumables = new RaceConsumables();

  // Slipstream: 0..1 draft strength computed each frame from the rider ahead.
  public draftFactor = 0;

  // Lap-time variation: a slow random walk around 1.0, scaled by the rider's
  // consistency and the difficulty, so nobody runs identical laps.
  private paceFactor = 1;
  private paceTarget = 1;

  // Controlled mistakes (rare, time-loss only — never crashes).
  private mistakeActive = false;
  private mistakeUntilMs = 0;
  private mistakeKind: MistakeKind = 'late_brake';
  private wasInCornerBraking = false;

  // Overtaking state machine
  private otActive = false;
  private otTargetIdx = -1;
  private otSide = 1;
  private otWeight = 0;
  private otLunge = false;
  private otCooldownMs = 0;

  // Defensive riding state
  private defWeight = 0;
  private defWasActive = false;

  // Sticky braking commitment: the binding scan sample (its apex) when
  // braking engaged, and the corner speed it demands. Held until that
  // sample is passed so the target never snaps back to top speed mid-corner.
  private holdIdx = -1;
  private holdVt = Infinity;

  // Behavioral counters (used by the verification harness / debugging).
  public stats = {
    overtakesAttempted: 0,
    overtakesCompleted: 0,
    mistakesTaken: 0,
    defended: 0,
  };

  constructor(profile: RiderProfile, track: BuiltTrack, gridSlotIndex: number) {
    this.profile = profile;
    this.personality = derivePersonality(profile);

    const bikeDef = MOTORCYCLES.find((b) => b.id === profile.bikeId) || MOTORCYCLES[0];
    this.bike = buildMotorcycle(bikeDef);

    // Performance tuning based on skill
    const skill = profile.skill;
    this.topSpeedMs = ((bikeDef.baseStats.topSpeed * 0.95) / 3.6) * skill;
    this.maxAccel = ((bikeDef.baseStats.acceleration / 100) * 12.0) * skill;
    this.maxBraking = ((bikeDef.baseStats.braking / 100) * 16.0) * skill;

    this.raceState = {
      rider: profile,
      distanceOnTrack: 0,
      splineProgress: 0,
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
      gapToBehindSec: 0,
    };

    this.reset(track, gridSlotIndex);
  }

  /** Applies the AI difficulty selected in settings (live, mid-race safe). */
  public setDifficulty(difficulty: AIDifficulty): void {
    // Stored on the env each frame; this only pre-seeds the default.
    this.difficultyProfile = DIFFICULTY_PROFILES[difficulty];
  }

  private difficultyProfile: DifficultyProfile = DIFFICULTY_PROFILES.normal;

  /**
   * Places the rider back on their grid slot and clears all race progression
   * state (laps, timings, distance, finish status) for a race restart.
   */
  public reset(track: BuiltTrack, gridSlotIndex: number): void {
    const slot = track.gridSlots[gridSlotIndex] || track.gridSlots[0];

    this.bike.root.position.copy(slot.position);
    this.bike.root.rotation.set(0, -slot.rotationY, 0);
    this.heading = slot.rotationY;

    this.progress = slot.progress;
    this.prevProgress = slot.progress;
    this.unwrappedProgress = slot.progress;
    this.speedMs = 0;
    this.targetSpeedMs = 0;
    this.leanAngle = 0;
    this.gear = 1;
    this.rpm = 4200;

    // Adopt the grid slot's real lateral position (prevents a jump to the
    // centerline on the first frame and preserves the staggered grid).
    const pt = track.spline.getPointAt(slot.progress, SCRATCH_PT);
    const tang = track.spline.getTangentAt(slot.progress, SCRATCH_TANG).normalize();
    const dx = slot.position.x - pt.x;
    const dz = slot.position.z - pt.z;
    // normal = cross(tangent, up) = (-t.z, 0, t.x)
    this.lateralOffset = dx * -tang.z + dz * tang.x;

    this.consumables.reset();

    // Fresh race: no draft, neutral pace, no mistakes/battles pending.
    this.draftFactor = 0;
    this.paceFactor = 1;
    this.paceTarget = 1;
    this.mistakeActive = false;
    this.wasInCornerBraking = false;
    this.otActive = false;
    this.otTargetIdx = -1;
    this.otWeight = 0;
    this.otLunge = false;
    this.otCooldownMs = 0;
    this.defWeight = 0;
    this.defWasActive = false;
    this.holdIdx = -1;
    this.holdVt = Infinity;
    this.stats = {
      overtakesAttempted: 0,
      overtakesCompleted: 0,
      mistakesTaken: 0,
      defended: 0,
    };

    this.completedLaps = 0;
    this.startLinePending = true;
    this.lapStartRaceTimeMs = 0;

    this.raceState.distanceOnTrack = (slot.progress - 1.0) * track.trackLength;
    this.raceState.splineProgress = slot.progress;
    this.raceState.currentLap = 1;
    this.raceState.currentPosition = gridSlotIndex + 1;
    this.raceState.speedKmh = 0;
    this.raceState.gear = 1;
    this.raceState.rpm = 4200;
    this.raceState.leanAngleRad = 0;
    this.raceState.isCrouched = false;
    this.raceState.isOffTrack = false;
    this.raceState.isDrafting = false;
    this.raceState.lastLapTime = null;
    this.raceState.bestLapTime = null;
    this.raceState.currentLapTime = 0;
    this.raceState.sectorTimes = [];
    this.raceState.finished = false;
    this.raceState.finishTime = null;
    this.raceState.gapToLeaderSec = 0;
    this.raceState.gapToAheadSec = 0;
    this.raceState.gapToBehindSec = 0;
  }

  /**
   * Handles a forward crossing of the start/finish line.
   *
   * The grid sits behind the line, so the first crossing simply begins lap 1.
   * Every later crossing completes a lap, records lap timing, re-rolls the
   * lap pace variation, and after the final lap marks the rider as finished.
   */
  private handleLineCrossing(raceTimeMs: number, totalLaps: number): void {
    if (this.raceState.finished) return;

    if (this.startLinePending) {
      this.startLinePending = false;
      return;
    }

    this.completedLaps++;

    const lapTimeMs = raceTimeMs - this.lapStartRaceTimeMs;
    this.lapStartRaceTimeMs = raceTimeMs;
    this.raceState.lastLapTime = lapTimeMs;
    if (this.raceState.bestLapTime === null || lapTimeMs < this.raceState.bestLapTime) {
      this.raceState.bestLapTime = lapTimeMs;
    }

    // Lap-time variation: pick a new pace target each lap so no rider runs
    // identical lap times (scaled by consistency + difficulty).
    const variance = 0.014 * (1.7 - this.personality.consistency) * this.difficultyProfile.paceVar;
    this.paceTarget = 1 + (Math.random() * 2 - 1) * variance;

    if (this.completedLaps >= totalLaps) {
      this.raceState.finished = true;
      this.raceState.finishTime = raceTimeMs;
      this.raceState.currentLap = totalLaps;
    } else {
      this.raceState.currentLap = this.completedLaps + 1;
    }
  }

  /**
   * Picks the target corner speed from a continuous forward scan of the
   * precomputed radius array. The binding constraint is the sample with the
   * lowest (vt² + 2·brake·distance) — the corner that most restricts speed
   * right now. Braking engages exactly when current speed² exceeds that
   * constraint, holds the binding sample's corner speed until that sample
   * passes (so the target never oscillates back to top speed mid-corner),
   * and releases so the rider accelerates out. The difficulty/personality
   * margin is folded into the effective braking power by the caller.
   */
  private computeTargetSpeed(env: AIUpdateEnv, brakeEff: number): number {
    const { line, difficulty } = env;
    const skill = this.profile.skill;
    const pers = this.personality;

    const gripBase =
      13.6 *
      (0.82 + 0.28 * skill) *
      this.consumables.gripAvg *
      difficulty.gripUse *
      pers.cornerSkill *
      this.paceFactor;

    const v = this.speedMs;
    const n = line.sampleCount;
    const spacing = line.spacingM;
    const startIdx = lineIndexAt(line, this.progress);
    const maxK = Math.min(n - 1, Math.ceil(MAX_SCAN_M / spacing));

    // Binding constraint over visible tight samples.
    let allow2 = Infinity;
    let bindVt = Infinity;
    let bindIdx = -1;
    for (let k = 1; k <= maxK; k++) {
      const idx = (startIdx + k) % n;
      const r = line.radius[idx];
      if (r >= RADIUS_STRAIGHT) continue;
      const vt = Math.min(this.topSpeedMs, Math.sqrt(gripBase * r));
      const bind = vt * vt + 2 * brakeEff * (k * spacing);
      if (bind < allow2) {
        allow2 = bind;
        bindVt = vt;
        bindIdx = idx;
      }
    }

    let target = this.topSpeedMs;

    if (this.holdIdx < 0) {
      // Not braking: engage only when the binding corner can no longer be
      // reached at full braking — never slow for a still-comfortable corner.
      if (bindIdx >= 0 && v * v > allow2) {
        this.holdIdx = bindIdx;
        this.holdVt = bindVt;
      }
    } else {
      // Braking: re-tighten if a more constraining corner comes into view.
      if (bindIdx >= 0 && bindVt < this.holdVt) {
        this.holdIdx = bindIdx;
        this.holdVt = bindVt;
      }
      // Release only once the binding sample is behind AND nothing tight
      // nearby still demands a slower speed: a corner complex must be one
      // commitment, not a series of re-approaches (passing an intermediate
      // binding sample and accelerating produced zigzags mid-complex).
      const behind = (this.holdIdx - startIdx + n) % n > n / 2;
      let release = behind;
      if (behind) {
        const nearK = Math.min(maxK, Math.ceil(NEAR_SCAN_M / spacing));
        for (let k = 1; k <= nearK; k++) {
          const r = line.radius[(startIdx + k) % n];
          if (r >= RADIUS_STRAIGHT) continue;
          const vt = Math.min(this.topSpeedMs, Math.sqrt(gripBase * r));
          if (vt < v - 0.5) {
            release = false;
            break;
          }
        }
      }
      if (release) {
        this.holdIdx = -1;
        this.holdVt = Infinity;
      } else {
        target = Math.min(target, this.holdVt);
      }
    }

    // A mistake costing drive speed shows up as a lower target briefly.
    if (this.mistakeActive && this.mistakeKind === 'slow_exit') target *= 0.94;

    // Slipstream extends straight-line top speed only (subtle, ~5%).
    if (this.draftFactor > 0 && target >= this.topSpeedMs * 0.95) {
      const bonus =
        this.topSpeedMs * 0.05 * this.draftFactor * pers.straightLineStrength;
      target = Math.min(this.topSpeedMs * 1.06, target + bonus);
    }

    // Never let the math talk the rider into a crawl.
    return Math.max(this.topSpeedMs * 0.25, Math.min(target, this.topSpeedMs * 1.06));
  }

  /** Starts/updates the overtaking state machine. */
  private updateOvertake(
    env: AIUpdateEnv,
    dt: number,
    aheadIdx: number,
    gap: number,
    raceTimeMs: number
  ): void {
    const { riders, line, track, difficulty } = env;
    const pers = this.personality;
    const half = line.halfWidth;
    const limit = half - 0.9;

    if (this.otActive) {
      const valid = this.otTargetIdx >= 0 && this.otTargetIdx < riders.length;
      const tgt = valid ? riders[this.otTargetIdx] : null;
      const myDist = this.raceState.distanceOnTrack;
      const tgtDist = tgt ? tgt.raceDistance : -Infinity;
      const otGap = tgt ? tgt.raceDistance - myDist : Infinity;

      // Complete: we are properly ahead of the target.
      if (tgt && myDist - tgtDist > 4.5) {
        this.otActive = false;
        this.otTargetIdx = -1;
        this.otWeight = 0;
        this.otLunge = false;
        this.otCooldownMs = raceTimeMs + 900;
        this.stats.overtakesCompleted++;
        return;
      }

      // Abort: lost the target, ran out of room, or the corner arrived.
      // NOTE: the pass-completion threshold is 4.5 m ahead, so the
      // "target fell behind" abort must trigger BEYOND that — with the
      // old -2 m bound every clean pass was aborted between 2 and 4.5 m
      // and `overtakesCompleted` could never increment.
      const lostTarget = !tgt || otGap > 35 || otGap < -5 || tgt.finished;
      const rAhead = radiusAt(line, this.progress + Math.max(otGap, 8) / track.trackLength);
      const cornerArrived = !this.otLunge && rAhead < 70 && otGap > 6;
      if (lostTarget || cornerArrived) {
        this.otActive = false;
        this.otTargetIdx = -1;
        this.otWeight = 0;
        this.otLunge = false;
        this.otCooldownMs = raceTimeMs + 1400;
        return;
      }

      this.otWeight = Math.min(1, this.otWeight + dt / 0.3);
      return;
    }

    if (aheadIdx < 0 || gap < 2 || gap > 30) return;
    if (raceTimeMs < this.otCooldownMs) return;
    if (this.raceState.finished) return;

    const tgt = riders[aheadIdx];
    const closing = this.speedMs > tgt.speedMs + 1.0 || gap < 10;
    if (!closing) return;

    // Pick a side with real room beside the target.
    const roomL = tgt.lateralOffset + limit; // space on their left
    const roomR = limit - tgt.lateralOffset; // space on their right
    const canLeft = roomL >= OVERTAKE_LATERAL + 0.4;
    const canRight = roomR >= OVERTAKE_LATERAL + 0.4;
    if (!canLeft && !canRight) return;

    const canPass = (s: number) => (s < 0 ? canLeft : canRight);
    const inside = cornerDirAt(line, this.progress + 30 / track.trackLength);
    let side: number;
    if (inside !== 0 && canPass(inside)) side = inside;
    else side = roomL > roomR ? -1 : 1;

    // Personality + difficulty gate the attempt: straights invite passes,
    // corners only invite a rare late-braking lunge from risk-takers.
    const straight = isStraightAt(line, this.progress + gap / 2 / track.trackLength);
    const rAhead = radiusAt(line, this.progress + gap / track.trackLength);
    const lunge = gap < 9 && rAhead < 120 && pers.riskTolerance > 0.65;
    const contextBoost = straight ? 1 : lunge ? 0.8 : 0.08;
    const rate =
      0.55 *
      pers.overtakingSkill *
      this.profile.aggressiveness *
      difficulty.overtakeAggr *
      contextBoost *
      (lunge ? 2.2 : 1);

    if (Math.random() < rate * dt) {
      this.otActive = true;
      this.otTargetIdx = aheadIdx;
      this.otSide = side;
      this.otWeight = 0;
      this.otLunge = lunge;
      this.stats.overtakesAttempted++;
    }
  }

  /** Updates defensive weighting: block the attacker, then reclaim the line. */
  private updateDefense(
    env: AIUpdateEnv,
    dt: number,
    behindIdx: number,
    gapBehind: number
  ): void {
    const pers = this.personality;
    const difficulty = env.difficulty;
    let targetW = 0;

    if (behindIdx >= 0 && gapBehind < 15 && !this.raceState.finished) {
      const attacker = env.riders[behindIdx];
      if (attacker.speedMs > this.speedMs - 0.5) {
        const urgency = Math.max(0, Math.min(1, (15 - gapBehind) / 9));
        targetW =
          urgency * (0.35 + 0.65 * pers.defensiveSkill) * difficulty.defend;
        if (pers.type === 'aggressive') targetW *= 1.15;
        targetW = Math.min(1, targetW);
      }
    }

    // Ramp fast to defend, release slowly so the racing line is reclaimed.
    const rate = targetW > this.defWeight ? 2.5 : 1.2;
    const delta = targetW - this.defWeight;
    const step = Math.min(Math.abs(delta), rate * dt);
    this.defWeight = this.defWeight + Math.sign(delta) * step;

    const active = this.defWeight > 0.3;
    if (active && !this.defWasActive) this.stats.defended++;
    this.defWasActive = active;
  }

  /** Rolls one mistake at a corner entry (rare, time-loss only). */
  private maybeTriggerMistake(env: AIUpdateEnv, raceTimeMs: number): void {
    const nearR = radiusAt(env.line, this.progress + 15 / env.track.trackLength);
    const inCornerBraking = nearR < 150;

    if (this.raceState.finished) {
      // No mistakes after the chequered flag: an in-lap is a cool-down.
      this.mistakeActive = false;
      this.wasInCornerBraking = inCornerBraking;
      return;
    }

    if (inCornerBraking && !this.wasInCornerBraking && !this.mistakeActive) {
      const pers = this.personality;
      const p =
        0.02 *
        (1.35 - this.profile.skill) *
        (0.7 + pers.riskTolerance) *
        pers.mistakeMultiplier *
        env.difficulty.mistakeMult;
      if (Math.random() < p) {
        const roll = Math.random();
        if (roll < 0.45) this.mistakeKind = 'late_brake';
        else if (roll < 0.75) this.mistakeKind = 'wide';
        else this.mistakeKind = 'slow_exit';
        this.mistakeActive = true;
        this.mistakeUntilMs =
          raceTimeMs + (this.mistakeKind === 'late_brake' ? 1600 : 2200);
        this.stats.mistakesTaken++;
      }
    }
    this.wasInCornerBraking = inCornerBraking;
    if (this.mistakeActive && raceTimeMs > this.mistakeUntilMs) {
      this.mistakeActive = false;
    }
  }

  public update(delta: number, env: AIUpdateEnv): void {
    const { track, line, riders, raceActive, raceTimeMs, totalLaps, difficulty } = env;
    if (!raceActive) {
      this.bike.updateAnimation(0, 0, 0, 0, false, delta);
      return;
    }

    const dt = Math.min(delta, 0.05);
    const L = track.trackLength;
    const half = line.halfWidth;
    const edgeLimit = half - EDGE_MARGIN;
    const myDist = this.raceState.distanceOnTrack;
    const myPos = this.bike.root.position;

    // Lap pace drifts slowly toward this lap's target.
    this.paceFactor = THREE.MathUtils.damp(this.paceFactor, this.paceTarget, 0.5, dt);

    // ---- Neighbor scan: nearest ahead/behind + draft source -------------
    let aheadIdx = -1;
    let aheadGap = Infinity;
    let behindIdx = -1;
    let behindGap = Infinity;
    let draftFound = false;
    let draftGap = 0;
    let draftLat = 0;

    for (let i = 0; i < riders.length; i++) {
      if (i === env.selfIndex) continue;
      const other = riders[i];
      const dd = other.raceDistance - myDist;
      const dLat = Math.abs(other.lateralOffset - this.lateralOffset);
      if (dd > 0 && dd < 60 && dd < aheadGap) {
        aheadGap = dd;
        aheadIdx = i;
      } else if (dd < 0 && -dd < 40 && -dd < behindGap) {
        behindGap = -dd;
        behindIdx = i;
      }
      if (dd > 0 && dd < 26 && (!draftFound || dd < draftGap)) {
        draftFound = true;
        draftGap = dd;
        draftLat = dLat;
      }
    }

    // ---- Slipstream -----------------------------------------------------
    if (draftFound) {
      const midProgress = this.progress + Math.min(draftGap, 20) / 2 / L;
      this.draftFactor = computeDraftFactor(
        draftGap,
        draftLat,
        isStraightAt(line, midProgress)
      );
    } else {
      this.draftFactor = 0;
    }
    this.raceState.isDrafting = this.draftFactor > 0.35;

    // ---- Mistakes (one at a time, rare) ---------------------------------
    this.maybeTriggerMistake(env, raceTimeMs);

    // ---- Speed target: grip-limited corner speed + braking ladder -------
    this.difficultyProfile = difficulty;
    const fuelFactor = 1 - 0.05 * (1 - this.consumables.fuelKg / FUEL_CAPACITY_KG);
    const accelNow = this.maxAccel * this.consumables.gripRear * fuelFactor;
    let brakeNow = this.maxBraking * this.consumables.gripFront * this.consumables.brakeScale;
    if (this.mistakeActive && this.mistakeKind === 'late_brake') brakeNow *= 0.92;

    // Braking-point margin scales *braking power*, not scan distance: >1
    // (EASY) = weaker effective braking so the rider commits earlier, <1
    // (PRO) = stronger braking so they commit later. Combined with the
    // feasibility scan this shifts the braking point with difficulty while
    // every rider still slows to their own grip-limited corner speed.
    const pers = this.personality;
    let margin =
      difficulty.brakeMargin * (1 + (0.95 - pers.brakingSkill) * 0.8);
    if (this.mistakeActive && this.mistakeKind === 'late_brake') margin *= 0.72;
    if (this.otActive && this.otLunge) margin *= 0.82;
    const brakeEff = Math.max(brakeNow / margin, 1);

    this.targetSpeedMs = this.computeTargetSpeed(env, brakeEff);

    // ---- Overtaking / defense -------------------------------------------
    this.updateOvertake(env, dt, aheadIdx, aheadGap, raceTimeMs);
    this.updateDefense(env, dt, behindIdx, behindGap);

    // ---- Lateral target: racing line + battles + avoidance --------------
    const idx = lineIndexAt(line, this.progress);
    let desired = line.targetOffset[idx];

    if (this.mistakeActive && this.mistakeKind === 'wide') {
      // Drift toward the outside of the corner: a believable missed apex.
      desired += -cornerDirAt(line, this.progress) * 1.5;
    }

    // Overtake: blend toward a position alongside the target.
    if (this.otActive && this.otTargetIdx >= 0 && this.otTargetIdx < riders.length) {
      const tgt = riders[this.otTargetIdx];
      const otTarget = THREE.MathUtils.clamp(
        tgt.lateralOffset + this.otSide * OVERTAKE_LATERAL,
        -edgeLimit,
        edgeLimit
      );
      desired = THREE.MathUtils.lerp(desired, otTarget, this.otWeight);
    }

    // Defense: claim the inside line ahead of the attacker.
    if (this.defWeight > 0.02 && behindIdx >= 0) {
      const attacker = riders[behindIdx];
      const dir = cornerDirAt(line, this.progress + 15 / L);
      let blockDir =
        dir !== 0 ? dir : attacker.lateralOffset >= 0 ? -1 : 1;
      // Wheel-to-wheel: never sweep across the attacker's line — hold the
      // side we are already on (crossing them at dd < 5 m is an overlap,
      // not a block). The racing line can be reclaimed once clear.
      if (behindGap < 5) {
        const side = Math.sign(this.lateralOffset - attacker.lateralOffset);
        if (side !== 0) blockDir = side;
      }
      const defTarget = THREE.MathUtils.clamp(
        attacker.lateralOffset + blockDir * 1.9,
        -edgeLimit,
        edgeLimit
      );
      desired = THREE.MathUtils.lerp(desired, defTarget, this.defWeight);
    }

    // Side-by-side spacing + occupied-line avoidance (all nearby riders).
    for (let i = 0; i < riders.length; i++) {
      if (i === env.selfIndex) continue;
      const other = riders[i];
      const dd = other.raceDistance - myDist;
      if (Math.abs(dd) > OCCUPY_WINDOW_M) continue;
      const dLat = desired - other.lateralOffset;

      if (Math.abs(dd) < 5.0) {
        // Overlapping longitudinally: keep a real lateral gap.
        if (Math.abs(dLat) < SIDE_BY_SIDE_SEP) {
          const roomL = other.lateralOffset + edgeLimit;
          const roomR = edgeLimit - other.lateralOffset;
          // Side choice comes from the ACTUAL lateral gap between the two
          // bikes: an established side is preserved (no crossing), and at
          // ~zero gap the rider index splits them to opposite sides. Using
          // the desired-line delta here instead let both riders pick the
          // same side and drift in lockstep while the gap never opened.
          const actualGap = this.lateralOffset - other.lateralOffset;
          let push: number;
          if (Math.abs(actualGap) > 0.05) push = Math.sign(actualGap);
          else push = env.selfIndex < i ? -1 : 1;
          if (Math.abs(other.lateralOffset + push * SIDE_BY_SIDE_SEP) > edgeLimit) {
            push = -push;
          }
          if (Math.abs(other.lateralOffset + push * SIDE_BY_SIDE_SEP) > edgeLimit) {
            push = roomL >= roomR ? -1 : 1;
          }
          desired = other.lateralOffset + push * SIDE_BY_SIDE_SEP;
        }
      } else if (dd > 4.5 && Math.abs(dLat) < 1.6) {
        // Someone occupies the line just ahead: adjust to the roomier side.
        const roomL = other.lateralOffset + edgeLimit;
        const roomR = edgeLimit - other.lateralOffset;
        desired = other.lateralOffset + (roomL >= roomR ? -1.7 : 1.7);
      }
      desired = THREE.MathUtils.clamp(desired, -edgeLimit, edgeLimit);
    }

    // Final wheel-to-wheel gap enforcement — runs after every other lateral
    // influence. In a dense pack an "occupied line" adjustment for a rider
    // 4.5-10 m away could overwrite the separation target set for the bike
    // actually alongside, letting the pair collapse. Only the MOST critical
    // neighbour (smallest lateral gap) is enforced: with several bikes
    // within 5 m, letting every pair write `desired` let a later iteration
    // mask the collapsing pair behind a different target.
    let critIdx = -1;
    let critGap = SIDE_BY_SIDE_SEP;
    for (let i = 0; i < riders.length; i++) {
      if (i === env.selfIndex) continue;
      const other = riders[i];
      if (Math.abs(other.raceDistance - myDist) >= 5.0) continue;
      const g = Math.abs(this.lateralOffset - other.lateralOffset);
      if (g < critGap) {
        critGap = g;
        critIdx = i;
      }
    }
    if (critIdx >= 0) {
      const other = riders[critIdx];
      const actualGap = this.lateralOffset - other.lateralOffset;
      // Established side preserved; coincident riders split by index to
      // opposite sides (a shared side choice drifts in lockstep).
      const push =
        Math.abs(actualGap) > 0.05
          ? Math.sign(actualGap)
          : env.selfIndex < critIdx
            ? -1
            : 1;
      desired = THREE.MathUtils.clamp(
        other.lateralOffset + push * SIDE_BY_SIDE_SEP,
        -edgeLimit,
        edgeLimit
      );
    }

    // Do not rear-end a slower rider when there is no room to pass.
    if (aheadIdx >= 0 && aheadGap < 4.5) {
      const other = riders[aheadIdx];
      if (Math.abs(other.lateralOffset - this.lateralOffset) < 2.4) {
        this.targetSpeedMs = Math.min(this.targetSpeedMs, other.speedMs + 1.0);
      }
    }

    // Smooth, physically believable lateral movement (never a teleport).
    const inBattle = this.otActive || this.defWeight > 0.3;
    this.lateralOffset = THREE.MathUtils.damp(
      this.lateralOffset,
      desired,
      inBattle ? 3.6 : 2.8,
      dt
    );
    // Hard track-limits clamp: AI never leaves the asphalt.
    this.lateralOffset = THREE.MathUtils.clamp(this.lateralOffset, -edgeLimit, edgeLimit);

    // ---- Speed integration (smooth accel / braking) ----------------------
    const brakingNow = this.speedMs > this.targetSpeedMs;
    if (!brakingNow) {
      this.speedMs = Math.min(this.targetSpeedMs, this.speedMs + accelNow * dt);
    } else {
      this.speedMs = Math.max(this.targetSpeedMs, this.speedMs - brakeEff * dt);
    }

    // ---- Corner phase for wear / animation -------------------------------
    const nearR = radiusAt(line, this.progress + 15 / L);
    const isHeavyCorner = nearR < 120;

    this.consumables.update(dt, {
      throttle: brakingNow ? 0 : 1,
      // Modulated brake demand: deep braking = full heat, maintenance
      // braking = little heat. A binary on/off pegged every rider's rotors
      // at max temperature, which flattened the difficulty differences.
      brake: brakingNow
        ? Math.min(1, (this.speedMs - this.targetSpeedMs) / Math.max(brakeEff * 0.4, 1))
        : 0,
      speedMs: this.speedMs,
      latUtil: nearR < 250 ? 0.65 : 0.08,
      longUtil: brakingNow ? 0.8 : 0.45,
      leanRatio: Math.min(Math.abs(this.leanAngle) / 1.11, 1),
      skidRatio: 0,
    });

    // ---- Advance along spline -------------------------------------------
    const distanceStep = this.speedMs * dt;
    const prev = this.progress;
    this.progress = (this.progress + distanceStep / L) % 1.0;

    // Distance bookkeeping always tracks the physical position — even for
    // finished riders, who keep riding an in-lap. Freezing their distance
    // would desync neighbour scans, rear-end caps and defense from reality
    // (riders braking for a ghost ahead of them). handleLineCrossing()
    // ignores finished riders, so laps and finish times stay locked.
    let deltaProgress = this.progress - prev;
    if (deltaProgress < -0.5) {
      deltaProgress += 1.0;
      this.handleLineCrossing(raceTimeMs, totalLaps);
    } else if (deltaProgress > 0.5) {
      deltaProgress -= 1.0;
    }
    this.unwrappedProgress += deltaProgress;

    this.raceState.distanceOnTrack = (this.unwrappedProgress - 1.0) * L;
    this.raceState.splineProgress = this.progress;
    this.raceState.currentLapTime = raceTimeMs - this.lapStartRaceTimeMs;

    // ---- 3D position / orientation (allocation-free) ---------------------
    const currentPt = track.spline.getPointAt(this.progress, SCRATCH_PT);
    const currentTang = track.spline.getTangentAt(this.progress, SCRATCH_TANG).normalize();
    // normal = cross(tangent, up) = (-t.z, 0, t.x)
    SCRATCH_FINAL.set(
      currentPt.x - currentTang.z * this.lateralOffset,
      currentPt.y + 0.12,
      currentPt.z + currentTang.x * this.lateralOffset
    );
    this.bike.root.position.copy(SCRATCH_FINAL);

    this.heading = Math.atan2(currentTang.x, -currentTang.z);
    this.bike.root.rotation.y = -this.heading;

    // Lean into the corner ahead (same visual rule as before).
    const lookTang = track.spline
      .getTangentAt((this.progress + 10 / L) % 1.0, SCRATCH_TANG2)
      .normalize();
    const crossTurn = currentTang.x * lookTang.z - currentTang.z * lookTang.x;
    const targetRoll = -crossTurn * (this.speedMs / 18) * 1.8;
    this.leanAngle = THREE.MathUtils.damp(
      this.leanAngle,
      THREE.MathUtils.clamp(targetRoll, -1.05, 1.05),
      6,
      dt
    );

    const isCrouched = !isHeavyCorner && this.speedMs > 45;
    this.bike.updateAnimation(this.speedMs, targetRoll * 0.25, this.leanAngle, 0, isCrouched, dt);

    this.raceState.speedKmh = this.speedMs * 3.6;
    this.raceState.gear = Math.min(6, Math.max(1, Math.floor(this.raceState.speedKmh / 55) + 1));
    this.raceState.rpm = 6000 + (this.speedMs / this.topSpeedMs) * 11500;
  }
}
