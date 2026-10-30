import { CircuitDefinition } from '../types/game';

export const CIRCUITS: CircuitDefinition[] = [
  {
    id: 'thunder_coast',
    name: 'Thunder Coast Circuit',
    country: 'Spain',
    flag: '🇪🇸',
    lengthKm: 4.2,
    turns: 14,
    lapsDefault: 3,
    description: 'Fast oceanfront straights, sweeping coastal bends, and heavy braking zones under the Mediterranean sun.',
    timeOfDay: 'day',
    weather: 'dry',
    // 3D spline control points (X, Y, Z) forming a closed loop
    splinePoints: [
      [0, 0, 0],         // Start / Finish line
      [0, 0, -120],      // Main launch straight
      [0, 0, -240],
      [25, 0, -360],     // Turn 1 fast right kink
      [90, 2, -450],     // Turn 2 sweeping right
      [200, 4, -480],
      [300, 4, -400],    // Turn 3 coastal hairpin entry
      [310, 3, -270],    // Turn 4 hairpin exit
      [240, 2, -180],
      [180, 1, -110],    // Turn 5 chicane entry
      [210, 2, -20],     // Turn 6 chicane exit
      [280, 5, 80],      // Turn 7 hill climb
      [350, 7, 180],     // Turn 8 crest
      [320, 5, 290],     // Turn 9 downhill sweeper
      [220, 2, 360],     // Turn 10 fast left
      [110, 1, 380],     // Turn 11 long curve
      [-20, 0, 340],     // Turn 12 switchback
      [-80, 0, 240],     // Turn 13 technical left
      [-40, 0, 150],     // Turn 14 final corner onto front straight
      [0, 0, 80],        // Straight approach through starting grid
    ],
    skyColors: {
      sky: '#38bdf8',
      horizon: '#bae6fd',
      ground: '#15803d',
      sunPosition: [250, 350, 200],
      sunColor: '#fffbeb',
      sunIntensity: 2.2,
      ambientIntensity: 0.8,
    },
  },
  {
    id: 'dragon_ridge',
    name: 'Dragon Ridge GP',
    country: 'Japan',
    flag: '🇯🇵',
    lengthKm: 4.8,
    turns: 16,
    lapsDefault: 3,
    description: 'Breathtaking mountain elevation changes, high-camber esses, and a dramatic plunge into the Dragon Hairpin.',
    timeOfDay: 'golden_hour',
    weather: 'sunset',
    splinePoints: [
      [0, 0, 0],          // Start / Finish
      [0, 2, -160],
      [-40, 8, -280],     // Turn 1 uphill left
      [-110, 16, -370],   // Turn 2 uphill right
      [-90, 22, -480],    // Turn 3 mountain crest
      [0, 24, -540],      // High speed ridge straight
      [120, 20, -560],    // Turn 4 sweep
      [220, 14, -510],    // Turn 5 downhill esses entry
      [260, 9, -410],     // Turn 6 downhill esses right
      [220, 5, -310],     // Turn 7 esses left
      [280, 2, -200],     // Turn 8 downhill compression
      [360, 0, -110],     // Turn 9 Dragon Hairpin
      [340, 2, 30],
      [260, 4, 150],      // Turn 11 flowing curve
      [170, 6, 260],      // Turn 12 valley bridge
      [70, 7, 340],       // Turn 13
      [-40, 5, 370],      // Turn 14
      [-130, 3, 310],     // Turn 15 bamboo chicane
      [-90, 1, 190],      // Turn 16 exit onto pit straight
      [-30, 0, 80],
    ],
    skyColors: {
      sky: '#f97316',
      horizon: '#fed7aa',
      ground: '#3f6212',
      sunPosition: [-300, 150, -400],
      sunColor: '#fdba74',
      sunIntensity: 2.4,
      ambientIntensity: 0.9,
    },
  },
  {
    id: 'desert_velocity',
    name: 'Desert Velocity Park',
    country: 'UAE',
    flag: '🇦🇪',
    lengthKm: 5.4,
    turns: 12,
    lapsDefault: 3,
    description: 'Gigantic 1.2km back straight allowing 340+ km/h top speeds, bordered by dunes and high-speed triple apexes.',
    timeOfDay: 'day',
    weather: 'dry',
    splinePoints: [
      [0, 0, 0],
      [0, 0, -260],
      [30, 0, -420],      // Turn 1 tight 90 deg right
      [110, 0, -520],
      [240, 1, -550],     // Turn 2 sweeping right
      [400, 2, -520],     // Turn 3 entry to ultra straight
      [600, 3, -400],     // High speed back straight
      [800, 3, -250],
      [900, 2, -80],      // Hard braking 340 -> 80 km/h
      [870, 1, 60],       // Turn 6 hairpin
      [740, 0, 160],      // Turn 7 left sweep
      [580, 0, 230],      // Turn 8 mid section
      [400, 0, 260],      // Turn 9
      [250, 0, 310],      // Turn 10 desert esses
      [130, 0, 330],
      [-20, 0, 270],      // Turn 11 fast chicane
      [-70, 0, 170],      // Turn 12 final turn
      [-30, 0, 70],
    ],
    skyColors: {
      sky: '#60a5fa',
      horizon: '#fef08a',
      ground: '#ca8a04',
      sunPosition: [100, 450, 100],
      sunColor: '#fef9c3',
      sunIntensity: 2.6,
      ambientIntensity: 0.85,
    },
  },
  {
    id: 'emerald_valley',
    name: 'Emerald Valley Raceway',
    country: 'Austria',
    flag: '🇦🇹',
    lengthKm: 4.4,
    turns: 13,
    lapsDefault: 3,
    description: 'Scenic alpine forest circuit with natural amphitheater curves, rolling hills, and treacherous high-curb apexes.',
    timeOfDay: 'overcast',
    weather: 'damp',
    splinePoints: [
      [0, 0, 0],
      [0, 1, -190],
      [40, 3, -330],      // Turn 1 uphill right
      [120, 8, -430],     // Turn 2 forest sweep
      [210, 12, -460],
      [310, 14, -420],    // Turn 3 mountain hairpin
      [330, 10, -290],
      [260, 6, -190],     // Turn 5 downhill carousel
      [180, 3, -110],
      [170, 2, 20],       // Turn 7 valley straight
      [200, 2, 160],      // Turn 8 lake turn
      [170, 3, 280],      // Turn 9
      [90, 2, 370],       // Turn 10 forest chicane entry
      [0, 1, 390],        // Turn 11 forest chicane exit
      [-100, 0, 330],     // Turn 12
      [-110, 0, 200],     // Turn 13 final curve
      [-50, 0, 80],
    ],
    skyColors: {
      sky: '#94a3b8',
      horizon: '#cbd5e1',
      ground: '#166534',
      sunPosition: [-200, 200, 150],
      sunColor: '#f1f5f9',
      sunIntensity: 1.8,
      ambientIntensity: 0.95,
    },
  },
  {
    id: 'neon_city',
    name: 'Neon City GP',
    country: 'Singapore',
    flag: '🇸🇬',
    lengthKm: 4.6,
    turns: 18,
    lapsDefault: 3,
    description: 'Electric night Grand Prix under thousands of stadium floodlights, illuminated skyscrapers, and reflective track curbs.',
    timeOfDay: 'night',
    weather: 'dry',
    splinePoints: [
      [0, 0, 0],
      [0, 0, -200],
      [-50, 0, -320],     // Turn 1 90-degree left
      [-140, 0, -380],    // Turn 2 90-degree right
      [-150, 0, -480],    // Turn 3 avenue straight
      [-70, 0, -560],     // Turn 4 marina bay hairpin
      [30, 0, -570],      // Turn 5
      [140, 0, -510],     // Turn 6 illuminated bridge
      [240, 0, -420],
      [290, 0, -300],     // Turn 8 boulevard straight
      [280, 0, -160],     // Turn 9 chicane
      [330, 0, -50],      // Turn 10
      [320, 0, 90],       // Turn 11 hotel complex
      [240, 0, 200],      // Turn 12
      [140, 0, 280],      // Turn 13
      [30, 0, 310],       // Turn 14 underpass
      [-80, 0, 270],      // Turn 15
      [-100, 0, 150],     // Turn 16
      [-40, 0, 70],       // Turn 17 onto main straight
    ],
    skyColors: {
      sky: '#020617',
      horizon: '#0f172a',
      ground: '#090d16',
      sunPosition: [0, -200, 0], // night, sun below horizon
      sunColor: '#38bdf8',
      sunIntensity: 0.2,
      ambientIntensity: 1.2, // bright stadium illumination
    },
  },
];
