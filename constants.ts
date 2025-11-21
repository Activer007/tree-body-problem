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

export const generateRandomScenario = (): BodyState[] => {
  const bodies: BodyState[] = [];
  const colors = ['#ffaa00', '#00aaff', '#ff4444'];

  // Generate 3 Stars with random positions and small random velocities
  for (let i = 0; i < 3; i++) {
    // Random position within a cube of +/- 6 units
    const pos: [number, number, number] = [
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12
    ];

    // Random spherical velocity with small magnitude (0.05 - 0.25) for chaotic but sustained interaction
    const speed = 0.05 + Math.random() * 0.20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const vel: [number, number, number] = [
      speed * Math.sin(phi) * Math.cos(theta),
      speed * Math.sin(phi) * Math.sin(theta),
      speed * Math.cos(phi)
    ];

    bodies.push(createBody(
      `Star ${String.fromCharCode(65 + i)}`,
      8 + Math.random() * 7, // Mass 8-15
      pos,
      vel,
      colors[i],
      true
    ));
  }

  // Generate Planet
  bodies.push(createBody(
    'Planet',
    0.01,
    [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20],
    [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5],
    '#ffffff',
    false
  ));

  return bodies;
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
  }
];