import { useContext } from "react";
import { StateContext } from "./editor-context";
import { WorkspaceState } from "./workspace-state";

export const useWorkspaceState = (): WorkspaceState => {
  const value = useContext(StateContext);

  if (!value) {
    throw new Error(`No StateProvider: this is a logical error.`);
  }

  return value;
};
