export interface ITreeNode {
  id: string;
  name: string;
  children?: ITreeNode[];
}

export interface FlattenedNode {
  id: string;
  name: string;
  depth: number;
  parent: string;
}

export class StatefulHierarchyController {
  readonly page: ITreeNode[];
  public roots: FlattenedNode[][];

  private _displaymodes: {
    [key: string]: "expanded" | "hidden" | "collapsed" | "normal";
  } = {};

  public get displaymodes() {
    return this._displaymodes;
  }

  constructor({ page }: { page: ITreeNode[] }) {
    this.page = page;
    this.flatten();
    this.roots.forEach((root) => {
      root.forEach((l) => {
        this._displaymodes[l.id] = "normal";
      });
    });
  }

  collapse(target: string, command: "collapse" | "expand") {
    console.log("collapse", target, command);
    switch (command) {
      case "collapse":
        this._displaymodes[target] = "collapsed";
        break;
      case "expand":
        this._displaymodes[target] = "expanded";
    }
  }

  get displayLayers() {
    const displayLayers: FlattenedNode[] = [];
    this.roots?.forEach((l) => {
      l.forEach((layer) => {
        if (this._displaymodes[layer.id] !== "hidden") {
          displayLayers.push(layer);
        }
      });
    });
    return displayLayers;
  }

  /**
   * returns the display mode.
   *
   * first, find the target node with find().
   *
   * find the list of parents that has the target node as a direct child or as a nested child.
   * iterate through the target's parents, if any of them is collapsed, return hidden.
   * if the target itself is collapsed, return collapsed.
   * if the target contains children, and not collapsed, return expanded. to check if the target contains a children, use haschildren()
   * if none of the above, return normal.
   * @param target
   */
  displayMode(target: string): "expanded" | "hidden" | "collapsed" | "normal" {
    const node = this.find(target);
    if (!node) {
      // this can't happen
      return "normal";
    }
    const parents = this.findParents(target);
    for (const parent of parents) {
      if (this._displaymodes[parent.id] === "collapsed") {
        return "hidden";
      }
    }
    if (this._displaymodes[target] === "collapsed") {
      return "collapsed";
    }
    if (this.hasChildren(target)) {
      return "expanded";
    }
    return "normal";
  }

  find(target: string): FlattenedNode | undefined {
    const flattened = this.flatten();
    for (const layer of flattened) {
      for (const node of layer) {
        if (node.id === target) {
          return node;
        }
      }
    }
  }

  findParents(target: string): FlattenedNode[] {
    const flattened = this.flatten();
    const _this = this.find(target);
    const parents: FlattenedNode[] = [];
    for (const layer of flattened) {
      for (const node of layer) {
        if (node.id === _this.parent) {
          parents.push(node);
        }
      }
    }
    return parents;
  }

  hasChildren(target: string): boolean {
    const layers = this.flatten();
    return layers.some((l) => l.some((layer) => layer.parent === target));
  }

  flatten(): FlattenedNode[][] {
    if (!this.roots) {
      this.roots = this.page.filter((l) => !!l).map((layer) => flatten(layer));
      return this.roots;
    } else {
      return this.roots;
    }
  }
}

export const flatten = <T extends ITreeNode>(
  tree: T,
  parent?: string,
  depth: number = 0
): FlattenedNode[] => {
  const convert = (node: T, depth: number, parent?: string) => {
    if (!node) {
      return;
    }

    const result: FlattenedNode = {
      ...node,
      depth: depth,
      parent,
    };

    return result;
  };

  const final = [];
  final.push(convert(tree, depth, parent));
  for (const child of tree?.children || []) {
    final.push(...flatten(child, tree.id, depth + 1));
  }
  return final;
};
