import { useContext, createContext } from "react";
import { WorkspaceState } from "@core/state";
import { StateContext } from "./state-context";

export const useWorkspaceState = (): WorkspaceState => {
  const value = useContext(StateContext);

  // If this happens, we'll conditionally call hooks afterward
  // TODO: Is there a better solution?
  if (!value) {
    throw new Error(`Missing StateProvider`);
  }

  return value;
};
