import type { IIdentifier } from "./identifier";
import type { ISortGroup, ISortItem } from "./sortable";

export function movementDiff({
  item,
  prevgroup,
  postgroup,
  prevorder,
  postorder,
  movingPosition,
  options = {
    bigstep: 1,
    smallstep: 1,
  },
}: {
  item: IIdentifier;
  prevgroup: ISortGroup;
  postgroup: ISortGroup;
  prevorder: number;
  postorder: number;
  movingPosition: "above" | "below" | "inside";
  options?: {
    bigstep?: number;
    smallstep?: number;
  };
}): MoveBetweenGroupDiffResult {
  const movementType: MoveBetweenGroupType =
    prevgroup.id === postgroup.id ? "moved-in-group" : "moved-between-group";

  let post: __InsertResult;
  switch (movementType) {
    case "moved-in-group":
      //
      // const movingDirection = prevorder < postorder ? 0 : -1;
      const itemexcludedGroup = prevgroup.children.filter(
        (c) => c.id !== item.id
      );
      const postmove = __insert<ISortItem>({
        step: {
          big: options.bigstep,
          small: options.smallstep,
        },
        insert: item,
        insertat: postorder, // + movingDirection,
        data: itemexcludedGroup,
      });
      post = postmove;
      break;
    case "moved-between-group":
      const postinsert = __insert<ISortItem>({
        step: {
          big: options.bigstep,
          small: options.smallstep,
        },
        insert: item,
        insertat: postorder,
        data: postgroup.children ?? [],
      });
      post = postinsert;
      break;
  }

  const _moved: SingleSortItemMoveResult = {
    id: item.id,
    sort: post.insert.sort,
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
      updates: post.shifted,
      moved: _moved,
    },
  };
}

interface __InsertResult<
  T extends ISortItem = any,
  O extends ISortItem = ISortItem
> {
  insert: O;
  data: (T | O)[];
  shifted: T[];
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
}): __InsertResult<T, any> {
  if (insertat < 0 || insertat == undefined) {
    throw `\`insertat\` cannot be negative value or empty. givven was ${insertat}`;
  }

  const _len = data?.length ?? 0;
  const _is_insert_at_last = _len < insertat;
  /* polish insertat */ insertat = _is_insert_at_last ? _len : insertat;

  /* sorting is required before running loop (for slicing) */ const sorted =
    data?.sort((d1, d2) => d1.sort - d2.sort)?.slice(insertat, data.length) ??
    []; /* from cursor to end of the data */

  const cursorItem = data?.[_is_insert_at_last ? insertat - 1 : insertat];
  const cursorSort = cursorItem?.sort ?? 0;
  let insertingSort = cursorSort;
  const shifted = [];

  if (_is_insert_at_last) {
    insertingSort = Math.ceil((cursorSort + 1) / big) * big;
  } else {
    const mustShift = (newsort: number, item: T) => {
      return (
        newsort < (item?.sort ?? 0) ||
        newsort <= cursorSort ||
        sorted.filter((d) => d.id !== item.id).some((d) => d.sort == newsort)
      );
    };

    const shiftUntil = (item: T) => {
      let i = 0;
      let _newsort = item?.sort ?? 0;
      while (mustShift(_newsort, item)) {
        _newsort += small;
        i++;
      }
      return i;
    };

    const _shiftUntil = shiftUntil(cursorItem);
    sorted.slice(0, _shiftUntil).map((item, i) => {
      let newsort = item.sort + small;
      shifted.push(item);
      item.sort = newsort;
    });
  }

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
  sort: number;
  originParent: string;
  originOrder: number;
  targetParent: string;
  targetOrder: number;
}
