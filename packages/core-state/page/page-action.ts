import { DocumentInitial } from "@boring.so/loader";
import type { PageId } from "@core/model";

export type PageAction =
  | MovePageAction //[type: "movePage", sourceIndex: number, destinationIndex: number]
  | SelectPageAction // [type: "selectPage", pageId: string]
  | AddPageAction //[type: "addPage", name: string]
  | DeleteCurrentPageAction //[type: "deletePage"]
  | RenameCurrentPageAction // [type: "renamePage", name: string]
  | DuplicateCurrentPageAction; //  [type: "duplicatePage"];

/**
 * !!DO NOT CHANGE VALUE!! key string indicating that the page is under root.
 * */
export const PageRootKey = "page-root";
export const PageRoot: unique symbol = Symbol(PageRootKey);
export type PageParentId = PageId | typeof PageRoot;

export const add_on_root: unique symbol = Symbol("add_on_root");
export const add_on_current: unique symbol = Symbol("add_on_current");
/**
 * add page action triggered by user
 */
export interface IAddPageAction {
  /**
   * name is required initially for adding. this will automatically change if title changes after initializing is done by template loader or other initilizer overrides.
   **/
  name: string;
  /**
   * parent page's id
   */
  parent?: PageParentId | typeof add_on_root | typeof add_on_current;
  initial?: DocumentInitial;
}
export interface AddPageAction extends IAddPageAction {
  type: "add-page";
}

export interface MovePageAction {
  type: "move-page";
  /** the moving target */
  id: string;
  movingPositon: "above" | "below" | "inside";
  from: number;
  to: number;
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
