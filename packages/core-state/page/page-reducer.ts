import produce from "immer";
import { getCurrentPage, getCurrentPageIndex } from "./page-selector";
import { ApplicationState } from "../application";
import { PageAction } from "./page-action";
import { Page } from "./page-model";

import { nanoid } from "nanoid";

export const createPage = (pages: Page[], name: string): Page => {
  const newPage = produce<Page>(
    {
      id: undefined,
      name: undefined,
      content: undefined,
    },
    (page) => {
      page.id = nanoid();
      page.name = name;
      return page;
    }
  );

  pages.push(newPage);
  return newPage;
};

export function pageReducer(
  state: ApplicationState,
  action: PageAction
): ApplicationState {
  switch (action[0]) {
    case "selectPage": {
      return produce(state, (draft) => {
        draft.selectedPage = action[1];
      });
    }
    case "addPage": {
      const [, name] = action;

      return produce(state, (draft) => {
        const newPage = createPage(draft.pages, name);
        draft.selectedPage = newPage.id;
      });
    }
    case "renamePage": {
      const [, name] = action;
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;
        const page = pages[pageIndex];

        pages[pageIndex] = produce(page, (page) => {
          page.name = name || `Page ${pages.length + 1}`;
          return page;
        });
      });
    }
    case "duplicatePage": {
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;
        const page = pages[pageIndex];

        const duplicatePage = produce<Page>(page, (page) => {
          page.id = nanoid();
          page.name = `${page.name} Copy`;

          return page;
        });

        pages.push(duplicatePage);
        draft.selectedPage = duplicatePage.id;
      });
    }
    case "deletePage": {
      const page = getCurrentPage(state);
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;

        pages.splice(pageIndex, 1);

        const newIndex = Math.max(pageIndex - 1, 0);
        draft.selectedPage = pages[newIndex].id;
      });
    }
    case "movePage": {
      const [, sourceIndex, destinationIndex] = action;

      return produce(state, (draft) => {
        const sourceItem = draft.pages[sourceIndex];

        draft.pages.splice(sourceIndex, 1);
        draft.pages.splice(destinationIndex, 0, sourceItem);
      });
    }
    default:
      return state;
  }
}
