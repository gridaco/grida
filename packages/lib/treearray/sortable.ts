import type { IIdentifier } from "./identifier";

type Key = string;
type ParentKey = Key;

export interface ISortGroup extends IIdentifier {
  id: string; // as in id of this group. (parent)
  children: ISortItem[];
}

export interface ISortItem extends IIdentifier {
  id: string;
  sort: number;
}

export interface TreeNodeWithUnevenSortDataArrayItem {
  id: Key;
  sort: number;
  parent?: ParentKey;
}

export interface TreeNodeAsArrayItem
  extends TreeNodeWithUnevenSortDataArrayItem {
  id: Key;
  index: number;
  parent: ParentKey;
  children: Key[];
}
