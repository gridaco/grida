import { ApplicationState } from "./application-state";
import { getSelectedPage, getSelectedObjects } from "@core/store/application";

const DEFAULT_EMPTYSTATE_STARTING_PAGE = "getting-started";

export function createInitialApplicationState(): ApplicationState {
  return {
    selectedPage: getSelectedPage() ?? DEFAULT_EMPTYSTATE_STARTING_PAGE,
    selectedObjects: getSelectedObjects() ?? [],
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
