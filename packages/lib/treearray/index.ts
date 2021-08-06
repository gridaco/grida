//

export interface ISortGroup {
  id: string; // as in id of this group. (parent)
  children: ISortItem[];
}

export interface ISortItem {
  id: string;
  sort: number;
}

export function movePreview({
  item,
  prevgroup,
  postgroup,
  prevorder,
  postorder,
  options = {
    bigstep: 1,
    smallstep: 1,
  },
}: {
  item: ISortItem;
  prevgroup: ISortGroup;
  postgroup: ISortGroup;
  prevorder: number;
  postorder: number;
  options?: {
    bigstep?: number;
    smallstep?: number;
  };
}): MoveBetweenGroupDiffResult {
  const movementType: MoveBetweenGroupType =
    prevgroup.id === postgroup.id ? "moved-in-group" : "moved-between-group";

  const diffPrevList = [];
  switch (movementType) {
    case "moved-in-group":
      //
      prevgroup.children.forEach((c) => {
        //
      });
      break;
    case "moved-between-group":
      //
      break;
  }

  const itemsOnSameHierarchy = postgroup.children
    .filter((p) => p.id !== item.id) // the list shall not include target item for calculation. (?)
    .sort((p1, p2) => p1.sort - p2.sort);

  /**
   * index of next/prev items on same hierarchy
   * [0, 1, | target-order:2 | 2, 3, 4] -> item's index (next, prev)  = (2, 1)
   * [0, 1, 2, 3, 4 | target-order:5 | ] -> item's index (next, prev)  = (-1, 4)
   **/
  const indexOfItemOnSameHierarchy__next =
    postorder === postgroup.children.length ? -1 : postorder;
  const indexOfItemOnSameHierarchy__prev =
    postorder !== postgroup.children.length ? postorder - 1 : postorder;

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
    console.log("sourceItem", item);
    item.sort = sortOfItemOnSameHierarchy__prev + 1;
    itemsOnSameHierarchy.forEach((p, i) => {
      if (p.sort > sortOfItemOnSameHierarchy__prev) {
        // push each forward after the inserted index
        p.sort = p.sort + 1;
      }
    });
  }
  // endregion

  const _moved: SingleSortItemMoveResult = {
    id: item.id,
    originParent: prevgroup.id,
    originOrder: prevorder,
    targetParent: postgroup.id,
    targetOrder: postorder,
  };

  return {
    result: movementType,
    prev: {
      parent: prevgroup.id,
      updates: [_moved],
      moved: _moved,
    },
    post: {
      parent: postgroup.id,
      updates: [_moved], // FIXME:
      moved: _moved, // FIXME:
    },
  };
}

export function __insert<T extends ISortItem = any, O = any>({
  step: { big, small = 1 },
  insert,
  insertat,
  data,
}: {
  step: {
    big: number;
    small?: number;
  };
  insert: O;
  insertat: number;
  data: T[];
}): { insert: O; data: (T | O)[]; shifted: T[] } {
  if (insertat < 0 || insertat == undefined) {
    throw "`insertat` cannot be negative value or empty";
  }

  const _len = data.length;
  const _is_insert_at_last = _len < insertat;
  /* polish insertat */ insertat = _is_insert_at_last ? _len : insertat;

  /* sorting is required before running loop (for slicing) */ const sorted =
    data
      .sort((d1, d2) => d1.sort - d2.sort)
      .slice(insertat, data.length); /* from cursor to end of the data */

  const cursorSort = data[_is_insert_at_last ? insertat - 1 : insertat].sort;
  const insertingSort = _is_insert_at_last ? cursorSort + 1 : cursorSort;
  const shifted = [];
  sorted.map((item, i) => {
    let newsort = item.sort;
    let s = 1;
    // .slice(i, data.length)
    const mustShift = () => {
      return (
        newsort < item.sort ||
        newsort <= cursorSort ||
        sorted.filter((d) => d.id !== item.id).some((d) => d.sort == newsort)
      );
    };
    if (mustShift()) {
      shifted.push(item);
    }
    while (mustShift()) {
      newsort += small;
      // newsort = big * s;
      s++;
    }
    item.sort = newsort;
    return item;
  });
  //

  const _insert: O = {
    ...insert,
    sort: insertingSort,
  };
  (data as (T | O)[]).splice(insertat, 0, _insert); // insert
  return { data, insert: _insert, shifted };
}

export type MoveBetweenGroupType = "moved-between-group" | "moved-in-group";

export interface MoveBetweenGroupDiffResult {
  result: MoveBetweenGroupType;
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
