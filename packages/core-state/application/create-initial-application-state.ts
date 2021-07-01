import { ApplicationState } from "./application-state";

export function createInitialApplicationState(): ApplicationState {
  return {
    selectedPage: "getting-started",
    selectedObjects: [],
    pages: [
      {
        type: "boring-document",
        id: "getting-started",
        name: "getting-started",
        content: "getting-started",
      },
    ],
  };
}
