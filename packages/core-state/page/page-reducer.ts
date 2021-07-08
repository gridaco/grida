import produce from "immer";
import { getCurrentPage, getCurrentPageIndex } from "./page-selector";
import { ApplicationState } from "../application";
import {
  AddPageAction,
  DuplicateCurrentPageAction,
  IAddPageAction,
  PageAction,
  RenameCurrentPageAction,
  SelectPageAction,
} from "./page-action";
import { Page, PageReference } from "@core/model";
import { nanoid } from "nanoid";
import { UnconstrainedTemplate } from "@boring.so/template-provider";
import {
  BoringContent,
  BoringDocument,
  BoringTitleLike,
  boringTitleLikeAsBoringTitle,
} from "@boring.so/document-model";

// store
import { PageStore } from "@core/store";
import { setSelectedPage } from "@core/store/application";

export const createPage = (
  pages: PageReference[],
  params: IAddPageAction
): Page => {
  const { name, initial } = params;
  // todo - handle content initialization

  let title: BoringTitleLike = name;
  let document: BoringDocument;
  // let content: BoringContent = undefined;
  if (initial instanceof UnconstrainedTemplate) {
    const _r = initial.render();
    title = _r.title;
    document = new BoringDocument({
      title: boringTitleLikeAsBoringTitle(_r.title),
      content: _r.content,
    });
    // content = _r.content;
  }

  const id = nanoid();
  const newPage = produce<Page>(
    {
      id: id,
      type: "boring-document",
      name: name,
      document: document,
    },
    (page) => {
      return page;
    }
  );

  // todo: incomplete save operation
  new PageStore().add(newPage);

  pages.push(newPage);
  return newPage;
};

export function pageReducer(
  state: ApplicationState,
  action: PageAction
): ApplicationState {
  switch (action.type) {
    case "select-page": {
      const { page } = <SelectPageAction>action;
      return produce(state, (draft) => {
        draft.selectedPage = action.page;
        setSelectedPage(page);
      });
    }
    case "add-page": {
      return produce(state, (draft) => {
        <AddPageAction>action;
        const newPage = createPage(draft.pages, action);
        draft.selectedPage = newPage.id;
      });
    }
    case "rename-current-page": {
      const { name } = <RenameCurrentPageAction>action;
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
    case "duplicate-current-page": {
      <DuplicateCurrentPageAction>action;
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;
        const page = pages[pageIndex];

        const duplicatePage = produce<PageReference>(page, (page) => {
          page.id = nanoid();
          page.name = `${page.name} Copy`;

          return page;
        });

        pages.push(duplicatePage);
        draft.selectedPage = duplicatePage.id;
      });
    }
    case "delete-current-page": {
      const page = getCurrentPage(state);
      const pageIndex = getCurrentPageIndex(state);

      return produce(state, (draft) => {
        const pages = draft.pages;

        pages.splice(pageIndex, 1);

        const newIndex = Math.max(pageIndex - 1, 0);
        draft.selectedPage = pages[newIndex].id;
      });
    }
    case "move-page": {
      const { originOrder, targetOrder, originParent, targetParent } = action;

      // @todo - add nested page support

      return produce(state, (draft) => {
        const sourceItem = draft.pages[originOrder];

        draft.pages.splice(originOrder, 1);
        draft.pages.splice(targetOrder, 0, sourceItem);
      });
    }
    default:
      return state;
  }
}
