import produce from "immer";
import { getCurrentPage, getCurrentPageIndex } from "./page-selector";
import { ApplicationState } from "../application";
import {
  AddPageAction,
  add_on_current,
  add_on_root,
  DuplicateCurrentPageAction,
  IAddPageAction,
  PageAction,
  PageRoot,
  PageRootKey,
  RenameCurrentPageAction,
  SelectPageAction,
} from "./page-action";
import { Page, PageReference } from "@core/model";
import { nanoid } from "nanoid";
import { UnconstrainedTemplate } from "@boring.so/template-provider";
import {
  BoringDocument,
  BoringTitleLike,
  boringTitleLikeAsBoringTitle,
  EmptyDocument,
} from "@boring.so/document-model";

// store
import { PageStore } from "@core/store";
import { setSelectedPage } from "@core/store/application";

export const createPage = (
  pages: PageReference[],
  selectedPage: string,
  params: IAddPageAction
): Page => {
  const { name, initial, parent } = params;
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
  } else {
    document = new EmptyDocument();
  }

  let linkparent: string;
  switch (parent) {
    case add_on_current:
      linkparent = selectedPage;
      break;
    case add_on_root:
    case PageRootKey:
    case PageRoot:
      linkparent = PageRootKey;
      break;
    default:
      linkparent = parent as string;
      break;
  }

  const id = nanoid();
  const newPage = produce<Page>(
    {
      id: id,
      type: "boring-document",
      name: name,
      sort: (() => {
        const last = pages
          .filter((p) => p.parent === linkparent)
          .sort((a, b) => a.sort - b.sort)
          .pop();
        return last.sort + 1;
      })(), // sort = parent.children => lowestSort + 1
      document: document,
      parent: linkparent,
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
        const newPage = createPage(draft.pages, draft.selectedPage, action);
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

      return produce(state, (draft) => {
        const _id = getCurrentPage(state).id;
        const movingPage = draft.pages.find((p) => p.id === _id);

        // region handle parent change
        // change of parent is optional.
        // if parent changed
        if (originParent !== targetParent) {
          let newParent;
          if (targetParent == PageRoot) {
            newParent = PageRootKey;
          } else {
            newParent = targetParent;
          }
          draft.pages[originOrder].parent = newParent;
        }
        const parent = draft.pages[originOrder].parent;
        // endregion handle parent change

        const itemsOnSameHierarchy = draft.pages
          .filter((p) => p.parent == parent && p.id !== _id)
          .sort((p1, p2) => p1.sort - p2.sort);

        /**
         * index of next/prev items on same hierarchy
         * [0, 1, | target-order:2 | 2, 3, 4] -> item's index (next, prev)  = (2, 1)
         * [0, 1, 2, 3, 4 | target-order:5 | ] -> item's index (next, prev)  = (-1, 4)
         **/
        const indexOfItemOnSameHierarchy__next =
          targetOrder === draft.pages.length ? -1 : targetOrder;
        const indexOfItemOnSameHierarchy__prev =
          targetOrder !== draft.pages.length ? targetOrder - 1 : targetOrder;

        /**
         * sort of next/prev items on same hierarchy
         * - `[{s:0}, {s:1}, | target-order:2 | {s:2}, {s:3}, {s:4}]` -> `(1, 2)`
         * - `[ | target-order:0 | {s:0}, {s:1}, {s:2}, {s:3}, {s:4}]` -> `(undefined, 0)`
         * - `[{s:0}, {s:1}, {s:2}, {s:3}, {s:4}, | target-order:2 |]` -> `(4, undefined)`
         **/
        const sortOfItemOnSameHierarchy__next =
          itemsOnSameHierarchy[indexOfItemOnSameHierarchy__next]?.sort;
        const sortOfItemOnSameHierarchy__prev =
          itemsOnSameHierarchy[indexOfItemOnSameHierarchy__prev]?.sort;
        const isMovingToFirst = sortOfItemOnSameHierarchy__prev === undefined;
        const isMovingToLast = sortOfItemOnSameHierarchy__next === undefined;

        // region assign sort
        let newSort;
        // is moving to first
        if (isMovingToFirst) {
          // in this case, we have two optoins.
          // 1. move to first via (n - 1)
          // 2. move others to back via (n + 1)
          newSort = sortOfItemOnSameHierarchy__next - 1;
        }
        // is adding to last
        else if (isMovingToLast) {
          newSort = sortOfItemOnSameHierarchy__prev + 1;
        }
        // is insering middle of array
        else {
          console.log("sourceItem", movingPage);
          movingPage.sort = sortOfItemOnSameHierarchy__prev + 1;
          itemsOnSameHierarchy.forEach((p, i) => {
            if (p.sort > sortOfItemOnSameHierarchy__prev) {
              // push each forward after the inserted index
              p.sort = p.sort + 1;
            }
          });
        }
        // endregion
      });
    }
    default:
      return state;
  }
}
