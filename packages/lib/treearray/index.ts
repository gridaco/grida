//

export interface ISortGroup {
  id: string; // as in id of this group. (parent)
  children: {
    id: number;
    sort: number;
  };
}

export function movePreview({
  prevgroup,
  postgroup,
  prevorder,
  postorder,
  options = {
    bigstep: 1,
    smallstep: 1,
  },
}: {
  prevgroup: ISortGroup;
  postgroup: ISortGroup;
  prevorder: number;
  postorder: number;
  options?: {
    bigstep?: number;
    smallstep?: number;
  };
}): MoveBetweenGroupDiffResult {
  //
  return;
}

export interface MoveBetweenGroupDiffResult {
  result: "moved-between-group" | "moved-in-group";
  prev: MoveSortItemDiffResult;
  post: MoveSortItemDiffResult;
}

/**
 * data container of move page result. the changed pages & its sort + parent data will be returned.
 */
export interface MoveSortItemDiffResult {
  parent: string;
  updates: SingleSortItemMoveResult[];
  moved: SingleSortItemMoveResult;
}

export interface SingleSortItemMoveResult {
  id: string;
  originParent: string;
  originOrder: number;
  targetParent: string;
  targetOrder: number;
}
