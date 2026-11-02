import {
  PlayerSaveData,
  PlayerSettings,
  BikeUpgrades,
  BikeCustomization,
  ChampionshipStanding,
  ChampionshipRoundResult,
  RiderRaceState,
} from '../types/game';
import { MOTORCYCLES, AI_RIDER_ROSTER } from '../data/bikes';

const STORAGE_KEY = 'moto_thunder_gp_save_v5';

export const DEFAULT_SETTINGS: PlayerSettings = {
  controls: 'touch_buttons', // Mandatory default: separate LEFT and RIGHT buttons
  steerSensitivity: 1.0,
  invertSteering: false, // Standard intuitive steering: Left steers Left, Right steers Right
  autoBrakeAssist: false,
  racingLineAssist: true,
  tcsLevel: 1,
  antiWheelie: true,
  manualGearbox: false,
  soundVolume: 0.8,
  engineVolume: 0.85,
  fxVolume: 0.75,
  musicVolume: 0.6,
  speedUnit: 'kmh',
  graphicsQuality: 'high',
  showFps: false,
  hapticFeedback: true,
};

const defaultUpgrades: BikeUpgrades = {
  engine: 0,
  brakes: 0,
  chassis: 0,
  tires: 0,
  aero: 0,
};

export const CHAMPIONSHIP_POINTS_TABLE = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4];

/** Normalizes a rider name into a legacy name-slug ID (matches old save format). */
function legacyRiderId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

/** Loose key used to match legacy name-slug standing IDs to canonical roster IDs. */
function normalizeRiderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function createInitialStandings(): ChampionshipStanding[] {
  const playerBikeName =
    MOTORCYCLES.find((b) => b.id === 'veloce_v4')?.name || 'GP Prototype';
  return [
    {
      riderId: 'player',
      name: 'Player (You)',
      bikeName: playerBikeName,
      points: 0,
      wins: 0,
      podiums: 0,
      isPlayer: true,
    },
    ...AI_RIDER_ROSTER.slice(0, 11).map((ai) => ({
      riderId: ai.id,
      name: ai.name,
      bikeName: MOTORCYCLES.find((b) => b.id === ai.bikeId)?.name || 'GP Prototype',
      points: 0,
      wins: 0,
      podiums: 0,
      isPlayer: false,
    })),
  ];
}

function createInitialSave(): PlayerSaveData {
  const bikeUpgrades: Record<string, BikeUpgrades> = {};
  const bikeCustomizations: Record<string, BikeCustomization> = {};

  MOTORCYCLES.forEach((bike) => {
    bikeUpgrades[bike.id] = { ...defaultUpgrades };
    bikeCustomizations[bike.id] = { ...bike.defaultColors };
  });

  return {
    credits: 15000,
    reputation: 100,
    selectedBikeId: 'veloce_v4',
    unlockedBikeIds: ['veloce_v4'],
    bikeUpgrades,
    bikeCustomizations,
    bestLaps: {},
    careerWins: 0,
    careerRaces: 0,
    championshipCurrentRound: 0,
    championshipStandings: createInitialStandings(),
    championshipRoundPoints: {},
    championshipRoundResults: {},
    settings: DEFAULT_SETTINGS,
  };
}

/**
 * Migrates championship standings from older save formats to canonical rider IDs.
 *
 * Older saves keyed AI standings by a slug of the rider's display name
 * (e.g. "matteo_rossi") while race results used "ai_0".."ai_10", so no AI rider
 * ever matched a standing and no AI ever scored points. This remaps legacy rows
 * onto the canonical roster IDs without touching the player's saved points,
 * wins or podiums.
 */
function migrateStandings(
  loaded: unknown,
  initialStandings: ChampionshipStanding[]
): ChampionshipStanding[] {
  if (!Array.isArray(loaded) || loaded.length === 0) return initialStandings;

  const legacyKeyToCanonical = new Map<string, string>();
  AI_RIDER_ROSTER.forEach((ai) => {
    legacyKeyToCanonical.set(normalizeRiderKey(ai.id), ai.id);
    legacyKeyToCanonical.set(normalizeRiderKey(ai.name), ai.id);
    legacyKeyToCanonical.set(normalizeRiderKey(legacyRiderId(ai.name)), ai.id);
  });

  // Accumulate points per canonical rider so duplicate legacy rows merge safely.
  const byCanonical = new Map<string, ChampionshipStanding>();
  let playerRow: ChampionshipStanding | null = null;

  loaded.forEach((raw) => {
    const row = raw as Partial<ChampionshipStanding>;
    if (!row || typeof row.riderId !== 'string') return;

    const base: ChampionshipStanding = {
      riderId: row.riderId,
      name: typeof row.name === 'string' ? row.name : row.riderId,
      bikeName: typeof row.bikeName === 'string' ? row.bikeName : 'GP Prototype',
      points: Number(row.points) || 0,
      wins: Number(row.wins) || 0,
      podiums: Number(row.podiums) || 0,
      isPlayer: row.isPlayer === true,
    };

    if (base.isPlayer || base.riderId === 'player') {
      playerRow = { ...base, riderId: 'player', isPlayer: true };
      return;
    }

    const canonicalId =
      legacyKeyToCanonical.get(normalizeRiderKey(base.riderId)) ??
      legacyKeyToCanonical.get(normalizeRiderKey(base.name));
    const targetId = canonicalId ?? base.riderId;

    const existing = byCanonical.get(targetId);
    if (existing) {
      existing.points += base.points;
      existing.wins += base.wins;
      existing.podiums += base.podiums;
    } else {
      byCanonical.set(targetId, { ...base, riderId: targetId, isPlayer: false });
    }
  });

  // Rebuild the canonical order from the roster, carrying migrated values over.
  const rosterById = new Map(AI_RIDER_ROSTER.map((ai) => [ai.id, ai]));
  const rebuilt: ChampionshipStanding[] = [
    playerRow ??
      initialStandings.find((s) => s.isPlayer) ?? {
        riderId: 'player',
        name: 'Player (You)',
        bikeName: MOTORCYCLES[0].name,
        points: 0,
        wins: 0,
        podiums: 0,
        isPlayer: true,
      },
  ];

  AI_RIDER_ROSTER.slice(0, 11).forEach((ai) => {
    const carried = byCanonical.get(ai.id);
    const roster = rosterById.get(ai.id)!;
    rebuilt.push(
      carried
        ? {
            ...carried,
            riderId: roster.id,
            name: roster.name,
            bikeName:
              MOTORCYCLES.find((b) => b.id === roster.bikeId)?.name || 'GP Prototype',
            isPlayer: false,
          }
        : {
            riderId: roster.id,
            name: roster.name,
            bikeName:
              MOTORCYCLES.find((b) => b.id === roster.bikeId)?.name || 'GP Prototype',
            points: 0,
            wins: 0,
            podiums: 0,
            isPlayer: false,
          }
    );
  });

  // Keep any unknown rows (forward compatibility) after the canonical ones.
  const knownIds = new Set(rebuilt.map((s) => s.riderId));
  byCanonical.forEach((row, id) => {
    if (!knownIds.has(id)) rebuilt.push(row);
  });

  return rebuilt;
}

function asRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' ? (value as Record<string, T>) : {};
}

export function loadSaveData(): PlayerSaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialSave();
    const parsed = JSON.parse(raw);
    const initial = createInitialSave();

    const loadedSettings = { ...initial.settings, ...(parsed.settings || {}) };
    // Force default to touch_buttons if not set or invalid
    if (!loadedSettings.controls) {
      loadedSettings.controls = 'touch_buttons';
    }

    // Round-indexed maps: JSON keys arrive as strings, so normalize to numbers.
    const roundPoints: Record<number, Record<string, number>> = {};
    Object.entries(asRecord<Record<string, number>>(parsed.championshipRoundPoints)).forEach(
      ([key, value]) => {
        const idx = Number(key);
        if (Number.isInteger(idx) && value && typeof value === 'object') roundPoints[idx] = value;
      }
    );
    const roundResults: Record<number, ChampionshipRoundResult> = {};
    Object.entries(asRecord<ChampionshipRoundResult>(parsed.championshipRoundResults)).forEach(
      ([key, value]) => {
        const idx = Number(key);
        if (Number.isInteger(idx) && value && typeof value === 'object') roundResults[idx] = value;
      }
    );

    return {
      ...initial,
      ...parsed,
      settings: loadedSettings,
      bikeUpgrades: { ...initial.bikeUpgrades, ...(parsed.bikeUpgrades || {}) },
      bikeCustomizations: { ...initial.bikeCustomizations, ...(parsed.bikeCustomizations || {}) },
      bestLaps: { ...initial.bestLaps, ...(parsed.bestLaps || {}) },
      championshipStandings: migrateStandings(
        parsed.championshipStandings,
        initial.championshipStandings
      ),
      championshipRoundPoints: roundPoints,
      championshipRoundResults: roundResults,
    };
  } catch (e) {
    console.error('Failed to load save data, resetting to defaults:', e);
    return createInitialSave();
  }
}

export function saveGameData(data: PlayerSaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to write to localStorage:', e);
  }
}

/**
 * Applies one championship round result to the standings.
 *
 * Scoring is idempotent per round: if the same round was already scored
 * (e.g. the player restarted the race from the results screen), the previous
 * points, win and podium entries for that round are reverted first so a round
 * can never be counted twice.
 */
export function applyChampionshipRoundResult(
  data: PlayerSaveData,
  roundIdx: number,
  results: RiderRaceState[],
  pointsTable: number[] = CHAMPIONSHIP_POINTS_TABLE
): PlayerSaveData {
  const roundPoints: Record<string, number> = {};
  const podiumIds: string[] = [];
  let winnerId = '';

  results.forEach((r, idx) => {
    const riderId = r.rider.id;
    roundPoints[riderId] = pointsTable[idx] ?? 0;
    if (idx === 0) winnerId = riderId;
    if (idx < 3) podiumIds.push(riderId);
  });

  const prevPoints = data.championshipRoundPoints?.[roundIdx];
  const prevResult: ChampionshipRoundResult | undefined =
    data.championshipRoundResults?.[roundIdx];

  const standings = data.championshipStandings.map((s) => {
    let points = s.points;
    let wins = s.wins;
    let podiums = s.podiums;

    // Revert previous scoring of this round (restarted race).
    if (prevPoints) points -= prevPoints[s.riderId] ?? 0;
    if (prevResult) {
      if (s.riderId === prevResult.winnerId) wins -= 1;
      if (prevResult.podiumIds?.includes(s.riderId)) podiums -= 1;
    }

    // Apply this round's result.
    points += roundPoints[s.riderId] ?? 0;
    if (s.riderId === winnerId) wins += 1;
    if (podiumIds.includes(s.riderId)) podiums += 1;

    return {
      ...s,
      points: Math.max(0, points),
      wins: Math.max(0, wins),
      podiums: Math.max(0, podiums),
    };
  });

  return {
    ...data,
    championshipStandings: standings,
    championshipRoundPoints: {
      ...data.championshipRoundPoints,
      [roundIdx]: roundPoints,
    },
    championshipRoundResults: {
      ...data.championshipRoundResults,
      [roundIdx]: { winnerId, podiumIds },
    },
    championshipCurrentRound: Math.max(
      data.championshipCurrentRound,
      roundIdx + 1
    ),
  };
}
