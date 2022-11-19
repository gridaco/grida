import { useDispatch } from "core/dispatch";
import { useCallback, useMemo } from "react";
import { useWorkspaceState } from "./use-workspace-state";
import { BackgroundTask } from "./workspace-state";

export function useWorkspace() {
  const state = useWorkspaceState();
  const dispatch = useDispatch();

  const { highlightedLayer, taskQueue } = state;

  const highlightLayer = useCallback(
    (highlight?: string) => dispatch({ type: "highlight-node", id: highlight }),
    [dispatch]
  );

  const pushTask = useCallback(
    (task: BackgroundTask) => dispatch({ type: "tasks/push", task }),
    [dispatch]
  );

  const popTask = useCallback(
    (task: BackgroundTask | { id: string }) =>
      dispatch({ type: "tasks/pop", task }),
    [dispatch]
  );

  return useMemo(
    () => ({
      highlightedLayer,
      highlightLayer,
      taskQueue,
      pushTask,
      popTask,
    }),
    [highlightedLayer, highlightLayer, taskQueue, pushTask, popTask]
  );
}
