import { produce as immerProduce, enablePatches, type Patch } from "immer";

enablePatches();

export type HistoryPatchEntry = {
  patches: Patch[];
  inversePatches: Patch[];
};

const historyPatchMap = new WeakMap<object, HistoryPatchEntry>();

export const produceWithHistory: typeof immerProduce = ((
  state: any,
  recipe: any,
  listener?: any
) => {
  let generatedPatches: Patch[] | undefined;
  let generatedInversePatches: Patch[] | undefined;

  const next = immerProduce(
    state,
    recipe,
    (patches: Patch[], inversePatches: Patch[]) => {
      generatedPatches = patches;
      generatedInversePatches = inversePatches;
      if (typeof listener === "function") {
        listener(patches, inversePatches);
      }
    }
  );

  if (
    next !== state &&
    generatedPatches &&
    generatedInversePatches &&
    (generatedPatches.length > 0 || generatedInversePatches.length > 0)
  ) {
    historyPatchMap.set(next as object, {
      patches: generatedPatches,
      inversePatches: generatedInversePatches,
    });
  }

  return next;
}) as typeof immerProduce;

export function consumeHistoryPatches(
  state: unknown
): HistoryPatchEntry | undefined {
  const entry = historyPatchMap.get(state as object);
  if (entry) {
    historyPatchMap.delete(state as object);
    return entry;
  }
  return undefined;
}
