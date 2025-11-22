import { Mode, ModeId, BodyState, SimulationConfig } from '../types';
import { PRESETS, generateRandomScenario } from '../constants';
import { makeRosetteController } from '../services/controllers/rosetteController';

function deepCopyBodies(bodies: BodyState[]): BodyState[] {
  return bodies.map(b => ({
    ...b,
    position: { ...b.position },
    velocity: { ...b.velocity }
  }));
}

const modes: Mode[] = PRESETS.map((preset) => {
  const base: Mode = {
    id: preset.name as ModeId,
    label: preset.label,
    createInitialBodies: () => {
      if (preset.name === 'Random') {
        return generateRandomScenario();
      }
      return deepCopyBodies(preset.bodies);
    }
  };

  if (preset.name === 'Rosette') {
    base.createController = (initialBodies) => makeRosetteController(initialBodies) as SimulationConfig['controller'];
  }

  return base;
});

export function getAllModes(): Mode[] {
  return modes;
}

export function getModeById(id: ModeId): Mode {
  const m = modes.find(m => m.id === id);
  if (!m) throw new Error(`Mode not found: ${id}`);
  return m;
}

export function getModeOptions(): Array<{ id: ModeId; label: string }> {
  return modes.map(m => ({ id: m.id, label: m.label }));
}

