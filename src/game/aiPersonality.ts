import { AIDifficulty, RiderProfile } from '../types/game';

/**
 * Rider personalities derived deterministically from the roster's existing
 * skill / aggressiveness values plus a stable per-rider hash. Personalities
 * are never cosmetic: every field below feeds directly into braking points,
 * corner speed, overtaking, defense, slipstream use and mistake rates.
 */
export type PersonalityType = 'aggressive' | 'smooth' | 'defensive' | 'attacker' | 'consistent';

export interface RiderPersonality {
  type: PersonalityType;
  /** Brake-point accuracy: higher = brakes closer to the ideal marker. */
  brakingSkill: number;
  /** Corner-speed carry: higher = closer to the grip limit. */
  cornerSkill: number;
  /** 0..1 — how stable lap times are (low = large lap-to-lap variation). */
  consistency: number;
  /** Overtaking willingness and execution quality. */
  overtakingSkill: number;
  /** How hard this rider protects a position. */
  defensiveSkill: number;
  /** 0..1 — appetite for late-braking lunges and risky moves. */
  riskTolerance: number;
  /** Slipstream usage multiplier on straights. */
  straightLineStrength: number;
  /** Per-corner-entry mistake probability multiplier. */
  mistakeMultiplier: number;
}

/** Stable 0..1 hash from a rider id — same rider, same personality, forever. */
function hashUnit(id: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Final avalanche so nearby salts spread out.
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const TYPE_TABLE: PersonalityType[] = ['smooth', 'defensive', 'consistent'];

export function derivePersonality(profile: RiderProfile): RiderPersonality {
  const a = profile.aggressiveness;
  const s = profile.skill;
  const h1 = hashUnit(profile.id, 1);
  const h2 = hashUnit(profile.id, 2);
  const h3 = hashUnit(profile.id, 3);

  // Archetype from aggressiveness, ties broken by the rider hash so the
  // roster spreads across all five types.
  let type: PersonalityType;
  if (a >= 0.92) type = 'aggressive';
  else if (a >= 0.84) type = 'attacker';
  else type = TYPE_TABLE[Math.floor(h1 * TYPE_TABLE.length) % TYPE_TABLE.length];

  switch (type) {
    case 'aggressive':
      return {
        type,
        brakingSkill: 0.88 + 0.12 * s,
        cornerSkill: 0.97 + 0.03 * h2,
        consistency: 0.55 + 0.2 * h3,
        overtakingSkill: 0.85 + 0.15 * h2,
        defensiveSkill: 0.8 + 0.2 * h3,
        riskTolerance: 0.8 + 0.2 * h1,
        straightLineStrength: 0.95 + 0.15 * h3,
        mistakeMultiplier: 1.5 + 0.5 * h2,
      };
    case 'attacker':
      return {
        type,
        brakingSkill: 0.85 + 0.15 * s,
        cornerSkill: 0.95 + 0.05 * h2,
        consistency: 0.6 + 0.2 * h3,
        overtakingSkill: 0.9 + 0.1 * h1,
        defensiveSkill: 0.55 + 0.25 * h3,
        riskTolerance: 0.6 + 0.25 * h2,
        straightLineStrength: 1.0 + 0.2 * h1,
        mistakeMultiplier: 1.1 + 0.4 * h3,
      };
    case 'defensive':
      return {
        type,
        brakingSkill: 0.82 + 0.18 * s,
        cornerSkill: 0.93 + 0.05 * h2,
        consistency: 0.7 + 0.2 * h3,
        overtakingSkill: 0.45 + 0.2 * h1,
        defensiveSkill: 0.9 + 0.1 * h2,
        riskTolerance: 0.25 + 0.2 * h3,
        straightLineStrength: 0.85 + 0.15 * h1,
        mistakeMultiplier: 0.8 + 0.3 * h2,
      };
    case 'consistent':
      return {
        type,
        brakingSkill: 0.86 + 0.14 * s,
        cornerSkill: 0.94 + 0.06 * h2,
        consistency: 0.85 + 0.15 * h1,
        overtakingSkill: 0.55 + 0.2 * h3,
        defensiveSkill: 0.6 + 0.2 * h1,
        riskTolerance: 0.35 + 0.2 * h2,
        straightLineStrength: 0.9 + 0.15 * h3,
        mistakeMultiplier: 0.55 + 0.3 * h1,
      };
    case 'smooth':
    default:
      return {
        type,
        brakingSkill: 0.9 + 0.1 * s,
        cornerSkill: 0.96 + 0.04 * h3,
        consistency: 0.75 + 0.2 * h2,
        overtakingSkill: 0.6 + 0.2 * h1,
        defensiveSkill: 0.55 + 0.25 * h2,
        riskTolerance: 0.3 + 0.2 * h3,
        straightLineStrength: 0.9 + 0.15 * h2,
        mistakeMultiplier: 0.7 + 0.3 * h1,
      };
  }
}

/**
 * Difficulty modifies AI *behavior*, never raw physics: how much of the
 * grip limit they use, when they start braking, how often they err, how
 * hard they attack/defend, and how much their pace varies lap to lap.
 */
export interface DifficultyProfile {
  /** Multiplier on usable corner grip (easy rides under the limit). */
  gripUse: number;
  /** Braking-point margin: >1 brakes earlier, <1 brakes later. */
  brakeMargin: number;
  /** Scales every mistake roll. */
  mistakeMult: number;
  /** Scales overtaking willingness. */
  overtakeAggr: number;
  /** Scales defensive strength. */
  defend: number;
  /** Scales lap-time variation. */
  paceVar: number;
}

export const DIFFICULTY_PROFILES: Record<AIDifficulty, DifficultyProfile> = {
  easy: { gripUse: 0.90, brakeMargin: 1.35, mistakeMult: 3.0, overtakeAggr: 0.6, defend: 0.5, paceVar: 1.7 },
  normal: { gripUse: 0.97, brakeMargin: 1.10, mistakeMult: 1.0, overtakeAggr: 1.0, defend: 1.0, paceVar: 1.0 },
  hard: { gripUse: 1.0, brakeMargin: 0.95, mistakeMult: 0.5, overtakeAggr: 1.3, defend: 1.2, paceVar: 0.7 },
  pro: { gripUse: 1.02, brakeMargin: 0.85, mistakeMult: 0.25, overtakeAggr: 1.5, defend: 1.4, paceVar: 0.5 },
};
