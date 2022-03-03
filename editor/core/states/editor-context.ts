import { createContext } from "react";
import { WorkspaceState } from "./workspace-state";

export const StateContext = createContext<WorkspaceState | undefined>(
  undefined
);
