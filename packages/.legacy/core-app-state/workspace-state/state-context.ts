import { createContext } from "react";
import { WorkspaceState } from "@core/state";

export const StateContext = createContext<WorkspaceState | undefined>(
  undefined
);
