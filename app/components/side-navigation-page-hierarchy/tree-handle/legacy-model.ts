import { PageParentId } from "@core/state";

export type PageTree = IPageHierarchy[];

export interface IPageHierarchy {
  id: string;
  name: string;
  parent: PageParentId;
  sort: number;
  children: IPageHierarchy[];
}
