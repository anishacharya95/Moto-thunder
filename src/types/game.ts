/**
 * Moto Thunder GP - Core Type Definitions
 */

export type GameMode = 'quick_race' | 'career' | 'championship' | 'time_trial' | 'practice';

export type CameraView = 'chase_far' | 'chase_close' | 'cockpit' | 'nose' | 'tv_broadcast';

export type ControlType = 'touch_slider' | 'touch_buttons' | 'touch_tilt' | 'keyboard';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface BikeStats {
  topSpeed: number;     // km/h (e.g. 330)
  acceleration: number; // 0-100 rating
  handling: number;     // lean agility & corner speed 0-100
  braking: number;      // deceleration power 0-100
  weight: number;       // kg (e.g. 157)
  power: number;        // bhp (e.g. 260)
}

export interface BikeUpgrades {
  engine: number;       // 0 to 5
  brakes: number;       // 0 to 5
  chassis: number;      // 0 to 5
  tires: number;        // 0 to 5
  aero: number;         // 0 to 5
}

export interface BikeCustomization {
  primaryColor: string;
  accentColor: string;
  frameColor: string;
  wheelColor: string;
  riderSuitColor: string;
  riderHelmetColor: string;
  raceNumber: number;
}

export interface BikeDefinition {
  id: string;
  name: string;
  manufacturer: string;
  country: string;
  description: string;
  price: number;
  unlockedByDefault: boolean;
  baseStats: BikeStats;
  defaultColors: BikeCustomization;
  soundPitchMultiplier: number;
  engineSoundType: 'screamer_v4' | 'inline4' | 'twin_turbo' | 'electric_gp';
}

export interface CircuitSector {
  distancePercent: number; // 0 to 1 along track spline
}

export interface CircuitDefinition {
  id: string;
  name: string;
  country: string;
  flag: string;
  lengthKm: number;
  turns: number;
  lapsDefault: number;
  description: string;
  timeOfDay: 'day' | 'golden_hour' | 'night' | 'overcast';
  splinePoints: [number, number, number][]; // 3D curve control points
  bankingAngles?: number[]; // bank angle in radians per point
  weather: 'dry' | 'damp' | 'sunset';
  skyColors: {
    sky: string;
    horizon: string;
    ground: string;
    sunPosition: [number, number, number];
    sunColor: string;
    sunIntensity: number;
    ambientIntensity: number;
  };
}

export interface RiderProfile {
  id: string;
  name: string;
  nationality: string;
  number: number;
  bikeId: string;
  isPlayer: boolean;
  skill: number;          // 0.7 - 1.05 multiplier for speed/consistency
  aggressiveness: number; // 0.1 - 1.0 (overtaking willingness)
}

export interface RiderRaceState {
  rider: RiderProfile;
  distanceOnTrack: number; // Total distance traveled around track in meters
  splineProgress: number;  // 0.0 to 1.0 around current lap
  currentLap: number;
  currentPosition: number; // 1 to 12
  speedKmh: number;
  gear: number;
  rpm: number;
  leanAngleRad: number;
  isCrouched: boolean;
  isOffTrack: boolean;
  isDrafting: boolean;
  lastLapTime: number | null;
  bestLapTime: number | null;
  currentLapTime: number;
  sectorTimes: number[];
  finished: boolean;
  finishTime: number | null;
  gapToLeaderSec: number;
  gapToAheadSec: number;
}

export interface TelemetryData {
  speedKmh: number;
  gear: number;
  rpm: number;
  leanDeg: number;
  position: number;
  totalRiders: number;
  lap: number;
  totalLaps: number;
  currentLapTimeMs: number;
  bestLapTimeMs: number | null;
  gapAheadSec: number;
  isOffTrack: boolean;
  isCrouched: boolean;
  playerPos?: { x: number; z: number };
  splineProgress?: number;
}

export interface PlayerSettings {
  controls: ControlType;
  steerSensitivity: number; // 0.5 - 2.0
  invertSteering: boolean; // false = standard (Left=Left, Right=Right), true = inverted
  autoBrakeAssist: boolean;
  racingLineAssist: boolean;
  tcsLevel: number; // Traction Control 0, 1, 2
  antiWheelie: boolean;
  soundVolume: number;
  engineVolume: number;
  fxVolume: number;
  musicVolume: number;
  speedUnit: 'kmh' | 'mph';
  graphicsQuality: GraphicsQuality;
  showFps: boolean;
  hapticFeedback: boolean;
}

export interface ChampionshipStanding {
  riderId: string;
  name: string;
  bikeName: string;
  points: number;
  wins: number;
  podiums: number;
  isPlayer: boolean;
}

export interface PlayerSaveData {
  credits: number;
  reputation: number;
  selectedBikeId: string;
  unlockedBikeIds: string[];
  bikeUpgrades: Record<string, BikeUpgrades>;
  bikeCustomizations: Record<string, BikeCustomization>;
  bestLaps: Record<string, number>; // circuitId -> best lap time in ms
  careerWins: number;
  careerRaces: number;
  championshipCurrentRound: number;
  championshipStandings: ChampionshipStanding[];
  settings: PlayerSettings;
}
