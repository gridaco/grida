import type { IIdentifier } from "./identifier";

export interface ISortGroup extends IIdentifier {
  id: string; // as in id of this group. (parent)
  children: ISortItem[];
}

export interface ISortItem extends IIdentifier {
  id: string;
  sort: number;
}
