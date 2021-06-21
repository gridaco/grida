import { ApplicationState } from "./application-state";

export function createInitialApplicationState(): ApplicationState {
  return {
    selectedPage: "getting-started",
    selectedObjects: [],
    pages: [],
  };
}
