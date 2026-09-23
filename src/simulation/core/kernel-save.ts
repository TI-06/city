import type { SaveEnvelope } from '../../persistence/save/save-envelope';
import type { SimulationEngine } from './simulation-engine';
import type { SimulationState } from './simulation-state';

export const KERNEL_SAVE_VERSION = 1;

export type KernelSave<TWorld> = SaveEnvelope<SimulationState<TWorld>>;

export function createKernelSave<TWorld>(
  engine: SimulationEngine<TWorld>,
  savedAtIso: string,
): KernelSave<TWorld> {
  return {
    saveVersion: KERNEL_SAVE_VERSION,
    revision: engine.state.revision,
    savedAtIso,
    state: engine.state,
  };
}

export function restoreKernelState<TWorld>(save: KernelSave<TWorld>): SimulationState<TWorld> {
  if (save.saveVersion !== KERNEL_SAVE_VERSION) {
    throw new RangeError(
      `Unsupported kernel save version: ${save.saveVersion}; expected ${KERNEL_SAVE_VERSION}`,
    );
  }

  if (save.revision !== save.state.revision) {
    throw new RangeError('Kernel save envelope revision does not match simulation state revision');
  }

  return save.state;
}
