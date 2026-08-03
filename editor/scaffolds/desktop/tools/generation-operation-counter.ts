export type GenerationOperationCounterState = Readonly<{
  epoch: string;
  count: number;
}>;

export type GenerationOperationCounterEvent = Readonly<{
  sourceEpoch: string;
  activeEpoch: string;
  busy: boolean;
}>;

/** Busy-operation ownership for keyed media playground instances. */
export namespace GenerationOperationCounter {
  export function initial(epoch: string): GenerationOperationCounterState {
    return { epoch, count: 0 };
  }

  export function isBusy(
    state: GenerationOperationCounterState,
    activeEpoch: string
  ): boolean {
    return state.epoch === activeEpoch && state.count > 0;
  }

  export function update(
    state: GenerationOperationCounterState,
    event: GenerationOperationCounterEvent
  ): GenerationOperationCounterState {
    if (event.sourceEpoch !== event.activeEpoch) return state;

    const count = state.epoch === event.activeEpoch ? state.count : 0;
    const nextCount = event.busy ? count + 1 : Math.max(0, count - 1);
    if (state.epoch === event.activeEpoch && state.count === nextCount) {
      return state;
    }
    return { epoch: event.activeEpoch, count: nextCount };
  }
}
