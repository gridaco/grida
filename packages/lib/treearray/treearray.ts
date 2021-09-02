import { nest } from "./nest";
type Key = string;
export const RootSymbol = Symbol("__root");
type ParentKey = Key | null | typeof RootSymbol;

function isKeyRoot(key: ParentKey) {
  return key === null || key === RootSymbol;
}

interface TreeNodeAsArrayItem {
  id: Key;
  index: number;
  parent: ParentKey;
  children: Key[];
}

interface TreeNodeWithUnevenSortDataArrayItem {
  id: Key;
  sort: number;
  parent?: ParentKey;
}

export class TreeArray {
  constructor(readonly seed: TreeNodeWithUnevenSortDataArrayItem[]) {}

  asTree() {
    return nest(this.seed, null, "parent", (a, b) => {
      return a.sort - b.sort;
    });
  }

  asArray() {
    return this.asTree().flat(Infinity);
  }

  asTreeArray(): TreeNodeAsArrayItem[] {
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

    return deepflat(this.asTree()).flat(Infinity);
  }
}

type IDeepTreeItemLike = {
  children: IDeepTreeItemLike[];
};
