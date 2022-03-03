import { useDispatch } from "core/dispatch";
import { useCallback, useMemo } from "react";
import { useWorkspaceState } from "./use-workspace-state";

export function useWorkspace() {
  const state = useWorkspaceState();
  const dispatch = useDispatch();

  const { highlightedLayer, preferences } = state;

  const highlightLayer = useCallback(
    (highlight?: string) =>
      dispatch({ type: "highlight-layer", id: highlight }),
    [dispatch]
  );

  return useMemo(
    () => ({
      highlightedLayer,
      highlightLayer,
      preferences,
    }),
    [highlightedLayer, highlightLayer, preferences]
  );
}
