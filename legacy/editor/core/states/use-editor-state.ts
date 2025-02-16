import { useMemo } from "react";
import { useWorkspaceState } from "./use-workspace-state";
import { useDispatch, FlatDispatcher } from "../dispatch";
import { EditorState } from "./editor-state";

export const useEditorState = (): [EditorState, FlatDispatcher] => {
  const state = useWorkspaceState();
  const dispatch = useDispatch();
  return useMemo(
    () => [state.history.present, dispatch],
    [state.history.present, dispatch]
  );
};
