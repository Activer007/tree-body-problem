import { Preset, BodyState } from './types';

export const G_CONST = 1.0; // Normalized Gravitational Constant for visualization
export const DEFAULT_TIME_STEP = 0.01;
export const MAX_TRAIL_LENGTH = 300;

const createBody = (
  name: string,
  mass: number,
  pos: [number, number, number],
  vel: [number, number, number],
  color: string,
  isStar: boolean = true
): BodyState => ({
  name,
  mass,
  position: { x: pos[0], y: pos[1], z: pos[2] },
  velocity: { x: vel[0], y: vel[1], z: vel[2] },
  // Reduced star radius multiplier to 0.18 (approx 60% of previous 0.3)
  radius: isStar ? Math.pow(mass, 1/3) * 0.18 : 0.2,
  color,
  isStar
});

/**
 * Helper function to generate a random position that maintains minimum distance
 * from all existing positions
 */
const generateDistantPosition = (
  existingPositions: [number, number, number][],
  minDistance: number,
  maxAttempts: number = 50
): [number, number, number] => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pos: [number, number, number] = [
      (Math.random() - 0.5) * 24, // Expanded range: ±12 units
      (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 24
    ];

    // Check distance from all existing positions
    const isFarEnough = existingPositions.every(existingPos => {
      const dx = pos[0] - existingPos[0];
      const dy = pos[1] - existingPos[1];
      const dz = pos[2] - existingPos[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return distance >= minDistance;
    });

    if (isFarEnough) {
      return pos;
    }
  }

  // Fallback: return a position even if it doesn't meet minimum distance
  // (to avoid infinite loops)
  return [
    (Math.random() - 0.5) * 24,
    (Math.random() - 0.5) * 24,
    (Math.random() - 0.5) * 24
  ];
};

export const generateRandomScenario = (): BodyState[] => {
  const bodies: BodyState[] = [];
  const colors = ['#ffaa00', '#00aaff', '#ff4444'];
  const positions: [number, number, number][] = [];

  // Minimum distance between any two bodies (in simulation units)
  const MIN_DISTANCE_BETWEEN_STARS = 12; // Distance between stars
  const MIN_DISTANCE_PLANET_TO_STAR = 8; // Distance from planet to any star

  /**
   * Generate 3 Stars with random positions and random velocities
   * Each star gets:
   * - Random position maintaining minimum distance from other stars
   * - Random velocity direction (spherical coordinates)
   * - Random velocity magnitude (0.05 - 0.25)
   * - Random mass (8-15)
   */
  for (let i = 0; i < 3; i++) {
    // Generate position that maintains minimum distance from other stars
    const pos = generateDistantPosition(positions, MIN_DISTANCE_BETWEEN_STARS);
    positions.push(pos);

    // Random spherical velocity with magnitude (0.05 - 0.25) for chaotic but sustained interaction
    // Using spherical coordinates: theta (azimuth), phi (polar angle)
    const speed = 0.05 + Math.random() * 0.20;
    const theta = Math.random() * Math.PI * 2; // Azimuth: 0 to 2π
    const phi = Math.acos(2 * Math.random() - 1); // Polar angle: 0 to π (uniform on sphere)

    // Convert spherical to Cartesian coordinates
    const vel: [number, number, number] = [
      speed * Math.sin(phi) * Math.cos(theta),
      speed * Math.sin(phi) * Math.sin(theta),
      speed * Math.cos(phi)
    ];

    bodies.push(createBody(
      `Star ${String.fromCharCode(65 + i)}`,
      8 + Math.random() * 7, // Random mass: 8-15
      pos,
      vel,
      colors[i],
      true
    ));
  }

  // Generate Planet with random position and velocity
  // Planet position must maintain minimum distance from all stars
  const planetPos = generateDistantPosition(positions, MIN_DISTANCE_PLANET_TO_STAR);

  // Random spherical velocity for planet
  const planetSpeed = 0.1 + Math.random() * 0.4;
  const planetTheta = Math.random() * Math.PI * 2;
  const planetPhi = Math.acos(2 * Math.random() - 1);

  const planetVel: [number, number, number] = [
    planetSpeed * Math.sin(planetPhi) * Math.cos(planetTheta),
    planetSpeed * Math.sin(planetPhi) * Math.sin(planetTheta),
    planetSpeed * Math.cos(planetPhi)
  ];

  bodies.push(createBody(
    'Planet',
    0.01,
    planetPos,
    planetVel,
    '#ffffff',
    false
  ));

  return bodies;
};

const LAGRANGE_SIDE = 12;
const LAGRANGE_RADIUS = LAGRANGE_SIDE / Math.sqrt(3);
const LAGRANGE_MASS = 10;
const LAGRANGE_SPEED = Math.sqrt((G_CONST * LAGRANGE_MASS) / LAGRANGE_SIDE);

const createRosetteBodies = (): BodyState[] => {
  const rosetteBodies: BodyState[] = [];
  const radius = 12;
  const masses = [10, 8, 10, 8, 10, 8];
  const totalMass = masses.reduce((sum, m) => sum + m, 0);
  const orbitalSpeed = Math.sqrt((G_CONST * totalMass) / radius) * 0.55;
  const colors = ['#ffaa00', '#00aaff', '#ff4444', '#aaff00', '#ff66cc', '#66ccff'];

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const vx = -orbitalSpeed * Math.sin(angle);
    const vy = orbitalSpeed * Math.cos(angle);

    rosetteBodies.push(
      createBody(
        `Petal ${String.fromCharCode(65 + i)}`,
        masses[i],
        [x, y, 0],
        [vx, vy, 0],
        colors[i % colors.length],
        true
      )
    );
  }


  return rosetteBodies;
};

export const PRESETS: Preset[] = [
  {
    name: 'Figure8',
    label: 'Stable Figure-8',
    bodies: [
      createBody('Alpha', 10, [9.7000436, -2.4308753, 0], [0.4662036850, 0.4323657300, 0], '#ffaa00'),
      createBody('Beta', 10, [-9.7000436, 2.4308753, 0], [0.4662036850, 0.4323657300, 0], '#00aaff'),
      createBody('Gamma', 10, [0, 0, 0], [-0.93240737, -0.86473146, 0], '#ff4444'),
      createBody('Planet', 0.01, [1, 1, 2], [0.5, 0.5, 0.1], '#ffffff', false)
    ]
  },
  {
    name: 'Hierarchical',
    label: 'Hierarchical (Sun-Earth-Moon)',
    bodies: [
      createBody('Sun A', 20, [0, 0, 0], [0, 0, 0], '#ffcc00'),
      createBody('Sun B', 5, [15, 0, 0], [0, 1.1, 0], '#ff4400'),
      createBody('Sun C', 2, [18, 0, 0], [0, 2.5, 0], '#00ccff'), // Orbits B
      createBody('Planet', 0.01, [5, 0, 0], [0, 2.0, 0], '#ffffff', false) // Orbits A
    ]
  },
  {
    name: 'ChaoticEjection',
    label: 'Chaotic Ejection',
    bodies: [
      createBody('Alpha', 10, [5, 0, 0], [-0.5, 0.5, 0], '#ffaa00'),
      createBody('Beta', 10, [-5, -2, 0], [0.5, 0.2, 0], '#00aaff'),
      createBody('Gamma', 8, [0, 5, 0], [0, -0.5, 0], '#ff4444'),
      createBody('Planet', 0.01, [1, 1, 0], [0.8, 0.5, 0.5], '#ffffff', false)
    ]
  },
  {
    name: 'Random',
    label: 'Random Cloud',
    // These bodies are placeholders; App.tsx will use generateRandomScenario()
    bodies: [
      createBody('Alpha', 12, [4, 4, 4], [-0.1, 0, 0], '#ffaa00'),
      createBody('Beta', 15, [-4, -4, -4], [0.1, 0.05, 0], '#00aaff'),
      createBody('Gamma', 8, [4, -4, 0], [0, 0.15, -0.05], '#ff4444'),
      createBody('Planet', 0.01, [0, 10, 0], [0.2, 0, 0], '#ffffff', false)
    ]
  },
  {
    name: 'LagrangeStable',
    label: 'Lagrange Triangle',
    bodies: [
      createBody('Star A', LAGRANGE_MASS, [LAGRANGE_RADIUS, 0, 0], [0, LAGRANGE_SPEED, 0], '#ffaa00'),
      createBody(
        'Star B',
        LAGRANGE_MASS,
        [-LAGRANGE_RADIUS / 2, (Math.sqrt(3) / 2) * LAGRANGE_RADIUS, 0],
        [(-Math.sqrt(3) / 2) * LAGRANGE_SPEED, -0.5 * LAGRANGE_SPEED, 0],
        '#00aaff'
      ),
      createBody(
        'Star C',
        LAGRANGE_MASS,
        [-LAGRANGE_RADIUS / 2, (-Math.sqrt(3) / 2) * LAGRANGE_RADIUS, 0],
        [(Math.sqrt(3) / 2) * LAGRANGE_SPEED, -0.5 * LAGRANGE_SPEED, 0],
        '#ff4444'
      )
    ]
  },
  {
    name: 'Rosette',
    label: 'Rosette Hexa-Ring',
    bodies: createRosetteBodies()
  }
];
