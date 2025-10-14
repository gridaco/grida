import { isDraft, produce, type Draft } from "immer";

export function updateState<S>(
  state: S,
  recipe: (draft: Draft<S>) => void
): S {
  if (isDraft(state)) {
    recipe(state as Draft<S>);
    return state;
  }

  return produce(state, recipe);
}
