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
  // Stability metrics (extended for stability control system)
  energyDeviation?: number;      // Relative deviation from initial energy
  virialRatio?: number;          // 2K/|U|, measure of equilibrium
  symmetryScore?: number;        // 0-1, geometric symmetry score
  minPairwiseDistance?: number;  // Minimum distance between any two bodies
  maxPairwiseDistance?: number;  // Maximum distance (ejection detection)
  angularMomentumZ?: number;     // Z-component of total angular momentum
  spatialSpread?: number;        // Spatial spread measure
  stabilityStatus?: 'stable' | 'warning' | 'critical';  // Overall stability status
}

// Stability metrics interface for detailed analysis
export interface StabilityMetrics {
  // Energy metrics
  totalEnergy: number;
  kineticEnergy: number;
  potentialEnergy: number;
  energyDeviation: number;       // |E(t) - E(0)| / |E(0)|
  virialRatio: number;           // 2K/|U|

  // Geometric metrics
  centroid: Vector3;
  radiusStd: number;              // Standard deviation of distances from centroid
  symmetryScore: number;         // 0-1, geometric symmetry (1 = perfect)
  minDistance: number;           // Minimum pairwise distance
  maxDistance: number;           // Maximum pairwise distance (ejection detection)
  spatialSpread: number;         // Spread measure: max-min

  // Dynamic metrics
  angularMomentum: Vector3;      // Total angular momentum
  energyChangeRate: number;      // dE/dt

  // Hierarchy metrics (for hierarchical systems)
  hillSpheres?: Array<{body: BodyState; radius: number}>;

  // Component-specific metrics
  speedStd?: number;             // Standard deviation of orbital speeds
  componentAnalysis?: any;       // For specific system types
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
    controller?: (state: BodyState[], t: number) => Vector3[]; // Dynamic controller injection
  } | void;
}

// Stability controller interface for preset-specific stability control
export interface StabilityController {
  onBeforeStep: (
    state: BodyState[],
    t: number,
    dt: number
  ) => {
    paramOverrides?: Partial<SimulationConfig>;
    controller?: SimulationConfig['controller'];
    stabilityMetrics?: Partial<StabilityMetrics>;
    uiFeedback?: {
      message?: string;
      level?: 'info' | 'warning' | 'critical';
      action?: string;
    };
  } | void;
}

// Parameter override for dynamic adjustments
export interface ParameterOverride {
  timeStep?: number;
  softening?: number;
  G?: number;
  energySampleInterval?: number;
}

// Preset with stability configuration
export interface PresetWithStability extends Preset {
  defaultConfig?: Partial<SimulationConfig>;      // Preset-specific default parameters
  stabilityController?: StabilityController;     // Built-in stability controller
  enableStabilityControl?: boolean;             // Feature flag
  stabilityMetrics?: string[];                  // Metrics to track
}

export type ModeParams = Record<string, any>;

export interface Mode {
  id: ModeId;
  label: string;
  description?: string;
  // Parameters driving UI; optional for existing presets
  parameters?: ParameterMeta[];
  // Create initial bodies; seed optional
  createInitialBodies: (seed?: number, params?: ModeParams) => BodyState[];
  // Optional controller factory to inject control accelerations
  createController?: (initialBodies: BodyState[], params?: ModeParams) => SimulationConfig['controller'];
  // Optional stability controller factory (onBeforeStep hook)
  createStabilityController?: (initialBodies: BodyState[], params?: ModeParams) => StabilityController;
}
