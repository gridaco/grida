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
    if (type == "inside") {
      const _reject_parent_moving_inner = reject_parent_moving_inner({
        data: arr,
        moving: movingitem,
        target: __targetted_item,
      });
      if (_reject_parent_moving_inner) {
        throw "cannot move self to inner self.";
      }
    }
    // endregion prevalidation

    let _target_parrent = undefined;
    let _target_order = undefined;
    switch (type) {
      // TODO: fixme - this is assuming that all the items are in a expended state. (if collapsed, we should handle that case)
      case "above":
        _target_parrent = __targetted_item.parent;
        _target_order = arr
          .filter((p) => __targetted_item.parent === p.parent)
          .indexOf(__targetted_item);
        break;
      // TODO: fixme - this is assuming that all the items are in a expended state. (if collapsed, we should handle that case)
      case "below":
        const __children_of_target = arr.filter(
          (p) => __targetted_item.id === p.parent
        );

        if (__children_of_target.length > 0) {
          // if target item has children, the moving item's new parent is target item since it is a expanded tree.
          _target_parrent = __targetted_item.id;
          // place it at the top of under this parent.
          _target_order = 0; // the lowest value. (place it on top)
        } else {
          // otherwise, the parent is target item's parent.
          _target_parrent = __targetted_item.parent;
          _target_order =
            this.childrenOf(__targetted_item.parent, arr).indexOf(
              __targetted_item
            ) + 1;
        }
        break;
      case "inside":
        _target_parrent = arr[to].id;
        // if moving inside, place it on the end of the children arr. (wich is .length)
        _target_order = this.childrenOf(_target_parrent, arr).length;
        break;
    }

    const _origin_order = arr
      .filter((p) => movingitem.parent === p.parent)
      .indexOf(movingitem);

    const item = arr[from];
    const prevs = this.childrenOf(_origin_parent, arr);
    const posts = this.childrenOf(_target_parrent, arr);

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

  private childrenOf<T extends { parent?: string }>(
    parent: string,
    arr: T[]
  ): T[] {
    return arr.filter((p) => parent === p.parent);
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
