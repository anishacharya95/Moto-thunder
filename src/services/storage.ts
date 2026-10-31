import { PlayerSaveData, PlayerSettings, BikeUpgrades, BikeCustomization, ChampionshipStanding } from '../types/game';
import { MOTORCYCLES, AI_RIDER_ROSTER, riderIdForName } from '../data/bikes';

const STORAGE_KEY = 'moto_thunder_gp_save_v5';

export const DEFAULT_SETTINGS: PlayerSettings = {
  controls: 'touch_buttons', // Mandatory default: separate LEFT and RIGHT buttons
  steerSensitivity: 1.0,
  invertSteering: false, // Standard intuitive steering: Left steers Left, Right steers Right
  autoBrakeAssist: false,
  racingLineAssist: true,
  tcsLevel: 1,
  antiWheelie: true,
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

function createInitialSave(): PlayerSaveData {
  const bikeUpgrades: Record<string, BikeUpgrades> = {};
  const bikeCustomizations: Record<string, BikeCustomization> = {};

  MOTORCYCLES.forEach((bike) => {
    bikeUpgrades[bike.id] = { ...defaultUpgrades };
    bikeCustomizations[bike.id] = { ...bike.defaultColors };
  });

  const initialStandings: ChampionshipStanding[] = [
    { riderId: 'player', name: 'Player (You)', bikeName: MOTORCYCLES[0].name, points: 0, wins: 0, podiums: 0, isPlayer: true },
    ...AI_RIDER_ROSTER.slice(0, 11).map((ai) => ({
      riderId: riderIdForName(ai.name),
      name: ai.name,
      bikeName: MOTORCYCLES.find((b) => b.id === ai.bikeId)?.name || 'GP Prototype',
      points: 0,
      wins: 0,
      podiums: 0,
      isPlayer: false,
    })),
  ];

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
    championshipStandings: initialStandings,
    settings: DEFAULT_SETTINGS,
  };
}

/**
 * Reconcile saved championship standings with the current rider roster.
 * Older saves stored rider ids that never matched the ids used by the race
 * engine, so AI riders silently scored no points. Entries are re-keyed by
 * rider name (preserving points/wins/podiums), duplicates are merged and any
 * roster rider missing from the save is appended with zero points.
 */
function reconcileStandings(
  saved: ChampionshipStanding[] | undefined,
  roster: ChampionshipStanding[]
): ChampionshipStanding[] {
  if (!Array.isArray(saved) || saved.length === 0) return roster;

  const result: ChampionshipStanding[] = [];
  const seen = new Set<string>();

  for (const entry of saved) {
    if (!entry || typeof entry.riderId !== 'string') continue;
    const isPlayer = Boolean(entry.isPlayer) || entry.riderId === 'player';
    const riderId = isPlayer ? 'player' : riderIdForName(String(entry.name ?? ''));
    if (seen.has(riderId)) continue;
    seen.add(riderId);
    result.push({
      ...entry,
      riderId,
      isPlayer,
      name: String(entry.name ?? riderId),
      bikeName: String(entry.bikeName ?? ''),
      points: Number(entry.points) || 0,
      wins: Number(entry.wins) || 0,
      podiums: Number(entry.podiums) || 0,
    });
  }

  for (const entry of roster) {
    if (!seen.has(entry.riderId)) {
      seen.add(entry.riderId);
      result.push({ ...entry });
    }
  }

  return result;
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

    return {
      ...initial,
      ...parsed,
      settings: loadedSettings,
      bikeUpgrades: { ...initial.bikeUpgrades, ...(parsed.bikeUpgrades || {}) },
      bikeCustomizations: { ...initial.bikeCustomizations, ...(parsed.bikeCustomizations || {}) },
      bestLaps: { ...initial.bestLaps, ...(parsed.bestLaps || {}) },
      championshipStandings: reconcileStandings(parsed.championshipStandings, initial.championshipStandings),
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
