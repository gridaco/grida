import { Draft } from "immer";
import { ApplicationState } from "../application";

export type PageMetadata = {
  focus: string;
};

export const getCurrentPageIndex = (state: Draft<ApplicationState>) => {
  const pageIndex = state.pages.findIndex(
    (page) => page.id === state.selectedPage
  );

  if (pageIndex === -1) {
    throw new Error("A page must always be selected");
  }

  return pageIndex;
};

export const getCurrentPage = (state: Draft<ApplicationState>) => {
  return state.pages[getCurrentPageIndex(state)];
};
