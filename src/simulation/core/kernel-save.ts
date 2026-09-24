import type { SaveEnvelope } from '../../persistence/save/save-envelope';
import type { SimulationClockState } from './simulation-clock';
import type { SimulationEngine } from './simulation-engine';
import type { RandomState } from './seeded-random';
import type { SimulationState } from './simulation-state';

export const KERNEL_SAVE_VERSION = 1;

export type KernelSave<TWorld> = SaveEnvelope<SimulationState<TWorld>>;

export type WorldSaveCodec<TWorld, TSavedWorld> = Readonly<{
  encode: (world: TWorld) => TSavedWorld;
  decode: (savedWorld: TSavedWorld) => TWorld;
}>;

export type EncodedSimulationState<TSavedWorld> = Readonly<{
  revision: number;
  clock: SimulationClockState;
  randomState: RandomState;
  world: TSavedWorld;
}>;

export type EncodedKernelSave<TSavedWorld> = SaveEnvelope<EncodedSimulationState<TSavedWorld>>;

function assertKernelEnvelopeRevision(
  save: Readonly<{
    saveVersion: number;
    revision: number;
    state: Readonly<{ revision: number }>;
  }>,
): void {
  if (save.saveVersion !== KERNEL_SAVE_VERSION) {
    throw new RangeError(
      `Unsupported kernel save version: ${save.saveVersion}; expected ${KERNEL_SAVE_VERSION}`,
    );
  }

  if (save.revision !== save.state.revision) {
    throw new RangeError('Kernel save envelope revision does not match simulation state revision');
  }
}

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

export function createKernelSaveWithCodec<TWorld, TSavedWorld>(
  engine: SimulationEngine<TWorld>,
  savedAtIso: string,
  codec: WorldSaveCodec<TWorld, TSavedWorld>,
): EncodedKernelSave<TSavedWorld> {
  const state = engine.state;

  return {
    saveVersion: KERNEL_SAVE_VERSION,
    revision: state.revision,
    savedAtIso,
    state: {
      revision: state.revision,
      clock: state.clock,
      randomState: state.randomState,
      world: codec.encode(state.world),
    },
  };
}

export function restoreKernelState<TWorld>(save: KernelSave<TWorld>): SimulationState<TWorld> {
  assertKernelEnvelopeRevision(save);
  return save.state;
}

export function restoreKernelStateWithCodec<TWorld, TSavedWorld>(
  save: EncodedKernelSave<TSavedWorld>,
  codec: WorldSaveCodec<TWorld, TSavedWorld>,
): SimulationState<TWorld> {
  assertKernelEnvelopeRevision(save);

  return {
    revision: save.state.revision,
    clock: save.state.clock,
    randomState: save.state.randomState,
    world: codec.decode(save.state.world),
  };
}
