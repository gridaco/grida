import { useMemo } from "react";
import { ApplicationState } from "@core/state";
import { useWorkspaceState } from "../workspace-state";
import { useDispatch, FlatDispatcher } from "../dispatch";

export const useApplicationState = (): [ApplicationState, FlatDispatcher] => {
  const state = useWorkspaceState();
  const dispatch = useDispatch();

  return useMemo(
    () => [state.history.present, dispatch],
    [state.history.present, dispatch]
  );
};
