export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BodyState {
  position: Vector3;
  velocity: Vector3;
  mass: number;
  radius: number;
  color: string;
  name: string;
  isStar: boolean;
}

export interface SimulationConfig {
  G: number;
  timeStep: number;
  softening: number; // To prevent infinite forces at collision
  energySampleInterval?: number; // Simulation seconds between energy recomputations
  controller?: (state: BodyState[], t: number) => Vector3[];
}

export interface SimulationStats {
  totalEnergy: number;
  kineticEnergy: number;
  potentialEnergy: number;
  habitable: boolean;
  era: 'Stable' | 'Chaotic' | 'Apocalypse';
  timeElapsed: number;
  fps: number;
}

export type PresetName =
  | 'Figure8'
  | 'Random'
  | 'Hierarchical'
  | 'Lagrange'
  | 'ChaoticEjection'
  | 'Rosette'
  | 'LagrangeStable';

export interface Preset {
  name: PresetName;
  label: string;
  bodies: BodyState[];
}

// --- Minimal architecture extensions for Mode/Schema-driven params ---
export type ModeId = PresetName; // keep backward compatibility with existing code for now

export type ParameterType = 'number' | 'boolean' | 'select' | 'vec3' | 'color';

export interface ParameterMeta {
  key: string;
  label: string;
  type: ParameterType;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Array<{ label: string; value: string | number }>;
  group?: string;
  validate?: (v: any) => string | void;
}

export interface TrajectoryController {
  onBeforeStep?: (
    state: BodyState[],
    t: number,
    dt: number
  ) => {
    paramOverrides?: Record<string, any>;
    impulses?: Array<{ bodyId: number; dv: [number, number, number] }>; // optional future use
  } | void;
}

export interface Mode {
  id: ModeId;
  label: string;
  description?: string;
  // Parameters driving UI; optional for existing presets
  parameters?: ParameterMeta[];
  // Create initial bodies; seed optional
  createInitialBodies: (seed?: number) => BodyState[];
  // Optional controller factory to inject control accelerations
  createController?: (initialBodies: BodyState[]) => SimulationConfig['controller'];
}
