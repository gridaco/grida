import { ApplicationState } from "./application-state";

export function createInitialApplicationState(): ApplicationState {
  return {
    selectedPage: "getting-started",
    selectedObjects: [],
    pages: [
      {
        id: "getting-started",
        name: "getting-started",
        content: "getting-started",
      },
    ],
  };
}
