import { ApplicationState, ApplicationSnapshot } from "./application-state";
import { getSelectedPage, getSelectedObjects } from "@core/store/application";
import { PageReference } from "@core/model";
import { PageStore } from "@core/store";

const DEFAULT_EMPTYSTATE_STARTING_PAGE = "built-in/getting-started";
const GETTING_STARTED_PAGE_REFERENCE: PageReference = {
  type: "boring-document",
  id: "built-in/getting-started",
  name: "Getting started",
};

export function createInitialApplicationState(
  app: ApplicationSnapshot
): ApplicationState {
  return {
    selectedPage: app.selectedPage,
    selectedObjects: app.selectedObjects,
    pages: app.pages,
  };
}

/**
 * fetches the last stored application state as snapshot
 **/
export async function fetchApplicationSnapshot(): Promise<ApplicationSnapshot> {
  const _pages = await new PageStore().getAll();
  const d: ApplicationSnapshot = {
    selectedPage: getSelectedPage() ?? DEFAULT_EMPTYSTATE_STARTING_PAGE,
    selectedObjects: getSelectedObjects() ?? [],
    pages:
      _pages.length > 0
        ? [..._pages, GETTING_STARTED_PAGE_REFERENCE]
        : [GETTING_STARTED_PAGE_REFERENCE],
  };
  return d;
}
