export interface Ctx {
  depth: number;
  index: number;
}

export interface WalkCallbacks<T> {
  /**
   * Called when a node is visited.
   * Return `false` to skip walking the node's children.
   */
  enter?: (
    node: T,
    parent: T | null,
    ctx: Ctx,
    terminate: () => void,
  ) => void | boolean;
  /**
   * Called after all children of the node have been visited.
   */
  exit?: (
    node: T,
    parent: T | null,
    ctx: Ctx,
    terminate: () => void,
  ) => void;
}

/**
 * Walk a tree in depth-first order without recursion.
 *
 * @param tree - Root node or an array of root nodes.
 * @param callbacks - Optional callbacks invoked on enter/exit of each node.
 */
export function walk<T extends { children?: T[] }>(
  tree: T | T[],
  callbacks: WalkCallbacks<T>
): void {
  const roots = Array.isArray(tree) ? tree : [tree];
  type Frame = {
    node: T;
    parent: T | null;
    depth: number;
    index: number;
    state: 0 | 1;
  };
  const stack: Frame[] = [];
  let terminated = false;
  const terminate = () => {
    terminated = true;
  };

  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ node: roots[i]!, parent: null, depth: 0, index: i, state: 0 });
  }

  while (stack.length && !terminated) {
    const frame = stack.pop()!;
    if (frame.state === 0) {
      const res = callbacks.enter?.(
        frame.node,
        frame.parent,
        { depth: frame.depth, index: frame.index },
        terminate,
      );
      if (terminated) break;
      if (res === false) {
        callbacks.exit?.(
          frame.node,
          frame.parent,
          { depth: frame.depth, index: frame.index },
          terminate,
        );
        if (terminated) break;
        continue;
      }
      frame.state = 1;
      stack.push(frame);
      const children = frame.node.children ?? [];
      for (let i = children.length - 1; i >= 0; i--) {
        if (terminated) break;
        stack.push({
          node: children[i]!,
          parent: frame.node,
          depth: frame.depth + 1,
          index: i,
          state: 0,
        });
      }
    } else {
      callbacks.exit?.(
        frame.node,
        frame.parent,
        { depth: frame.depth, index: frame.index },
        terminate,
      );
      if (terminated) break;
    }
  }
}
