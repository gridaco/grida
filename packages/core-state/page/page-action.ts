export type PageAction =
  | MovePageAction //[type: "movePage", sourceIndex: number, destinationIndex: number]
  | SelectPageAction // [type: "selectPage", pageId: string]
  | AddPageAction //[type: "addPage", name: string]
  | DeleteCurrentPageAction //[type: "deletePage"]
  | RenameCurrentPageAction // [type: "renamePage", name: string]
  | DuplicateCurrentPageAction; //  [type: "duplicatePage"];

export type PageId = string;
export const PageRoot: unique symbol = Symbol("page-root");
export type PageParentId = PageId | typeof PageRoot;

/**
 * add page action triggered by user
 */
export interface AddPageAction {
  type: "add-page";
  name: string;
  /**
   * parent page's id
   */
  parent?: PageParentId;
}

export interface MovePageAction {
  type: "move-page";
  originOrder: number;
  targetOrder: number;
  originParent: PageParentId;
  targetParent: PageParentId;
}

export interface SelectPageAction {
  type: "select-page";
  page: PageId;
}

export interface DeleteCurrentPageAction {
  type: "delete-current-page";
}

export interface RenameCurrentPageAction {
  type: "rename-current-page";
  /**
   * new name of the page
   */
  name: string;
}

export interface DuplicateCurrentPageAction {
  type: "duplicate-current-page";
}
