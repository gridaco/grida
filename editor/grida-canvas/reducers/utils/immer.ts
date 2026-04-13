import { isDraft, original, produce, type Draft } from "immer";

export function updateState<S>(state: S, recipe: (draft: Draft<S>) => void): S {
  if (isDraft(state)) {
    recipe(state as Draft<S>);
    return state;
  }

  // Mutable bypass: if the state has __original, it's a mutable clone
  // being used outside Immer. Apply the recipe directly.
  if ((state as any).__original) {
    recipe(state as Draft<S>);
    return state;
  }

  return produce(state, recipe);
}

/**
 * Like Immer's `original()`, but works in both Immer and mutable-bypass
 * contexts. When running inside an Immer produce, returns the original
 * frozen state. When running in the mutable bypass (where the "draft" is
 * a plain mutable object with a stashed `__original`), returns that.
 */
export function safeOriginal<T>(draft: Draft<T>): T | undefined {
  if (isDraft(draft)) return original(draft);
  return (draft as any).__original as T | undefined;
}
