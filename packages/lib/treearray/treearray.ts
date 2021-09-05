import { nest } from "./nest";
import { movementDiff } from "./movement-diff";
import { reject_parent_moving_inner } from "./validators";
import { TreeNodeWithUnevenSortDataArrayItem } from "./sortable";

type IDeepTreeItemLike = {
  children: IDeepTreeItemLike[];
};

export class TreeArray<
  T extends TreeNodeWithUnevenSortDataArrayItem = TreeNodeWithUnevenSortDataArrayItem
> {
  constructor(
    readonly seed: TreeNodeWithUnevenSortDataArrayItem[],
    readonly rootKey: string = null
  ) {}

  asTree() {
    return nest(this.seed, this.rootKey, "parent", (a, b) => {
      return a.sort - b.sort;
    });
  }

  asArray() {
    throw "method `asArray` is not ready to use";
    return this.asTree().flat(Infinity);
  }

  move({
    from,
    to,
    type,
  }: {
    /**
     * index of origin position
     */
    from: number;
    /**
     * index of target position
     */
    to: number;
    type: "above" | "below" | "inside";
  }) {
    // assuming that movement is bassed on tree-array structure
    const arr = this.asTreeArray();
    const movingitem = arr[from];
    const _origin_parent = arr[from].parent;
    const __targetted_item = arr[to];

    // region prevalidation
    const _reject_parent_moving_inner = reject_parent_moving_inner({
      data: arr,
      moving: movingitem,
      target: __targetted_item,
    });
    if (_reject_parent_moving_inner) {
      throw "cannot move self to inner self.";
    }
    // endregion prevalidation

    let _target_parrent = undefined;
    let _target_order = undefined;
    switch (type) {
      case "above":
        _target_parrent = arr[to].parent;
        _target_order = arr
          .filter((p) => __targetted_item.parent === p.parent)
          .indexOf(__targetted_item);
      case "below":
        _target_parrent = arr[to].parent;
        _target_order = arr
          .filter((p) => __targetted_item.parent === p.parent)
          .indexOf(__targetted_item);
        break;
      case "inside":
        _target_parrent = arr[to].id;
        _target_order = arr.filter((p) => _target_parrent === p.parent).length;
        break;
    }

    const _origin_order = arr
      .filter((p) => movingitem.parent === p.parent)
      .indexOf(movingitem);

    const item = arr[from];
    const prevs = arr.filter((p) => p.parent === _origin_parent);
    const posts = arr.filter((p) => p.parent === _target_parrent);

    //
    return movementDiff({
      item: item,
      prevgroup: {
        id: _origin_parent,
        children: prevs,
      },
      postgroup: {
        id: _target_parrent,
        children: posts,
      },
      prevorder: _origin_order,
      postorder: _target_order,
      options: {
        bigstep: 1000,
      },
    });
  }

  private _as_tree_array_cache: (T & { depth: number })[];
  asTreeArray(): (T & { depth: number })[] {
    if (this._as_tree_array_cache) {
      return this._as_tree_array_cache;
    }
    const deepflat = (arr: IDeepTreeItemLike[]) => {
      const flat = [];
      for (const item of arr) {
        const children = deepflat(item.children);
        const _nochild_item = delete item.children && item;
        flat.push(_nochild_item);
        if (children.length > 0) {
          flat.push(children);
        }
      }
      return flat;
    };

    const res = deepflat(this.asTree()).flat(Infinity);
    this._as_tree_array_cache = res;
    return res;
  }
}
