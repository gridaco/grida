export type PageAction =
  | MovePageAction //[type: "movePage", sourceIndex: number, destinationIndex: number]
  | SelectPageAction // [type: "selectPage", pageId: string]
  | AddPageAction //[type: "addPage", name: string]
  | DeleteCurrentPageAction //[type: "deletePage"]
  | RenameCurrentPageAction // [type: "renamePage", name: string]
  | DuplicateCurrentPageAction; //  [type: "duplicatePage"];

export type PageId = string;
export type PageParentId = PageId | "root";

/**
 * add page action triggered by user
 */
export interface AddPageAction {
  type: "addPage";
  name: string;
  /**
   * parent page's id
   */
  parent?: PageParentId;
}

export interface MovePageAction {
  type: "movePage";
  originOrder: number;
  targetOrder: number;
  originParent: PageParentId;
  targetParent: PageParentId;
}

export interface SelectPageAction {
  type: "selectPage";
  page: PageId;
}

export interface DeleteCurrentPageAction {
  type: "deletePage";
}

export interface RenameCurrentPageAction {
  type: "renamePage";
  /**
   * new name of the page
   */
  name: string;
}

export interface DuplicateCurrentPageAction {
  type: "duplicatePage";
}
