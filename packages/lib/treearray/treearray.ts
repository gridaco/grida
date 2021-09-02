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
    //
  }

  asTreeArray(): TreeNodeAsArrayItem[] {
    // this.seed.map((d) => {
    //   //

    return [];
  }
}
