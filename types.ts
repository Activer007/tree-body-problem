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

export type PresetName = 'Figure8' | 'Random' | 'Hierarchical' | 'Lagrange' | 'ChaoticEjection';

export interface Preset {
  name: PresetName;
  label: string;
  bodies: BodyState[];
}