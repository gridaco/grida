import { useEffect, useState } from "react";
import { useEditorState } from "core/states";
import { CraftElement } from "@code-editor/craft";
import { access, findIndexPath } from "tree-visit";
export function useInspectorElement() {
  const [t, setT] = useState<CraftElement>();
  const [state] = useEditorState();

  useEffect(() => {
    const path = findIndexPath(state.craft, {
      getChildren: (node) => node.children as any,
      predicate: (c, indexPath) =>
        c.type !== "document" &&
        c.type !== "viewport" &&
        c.id === state.selectedNodes[0],
    });

    if (path) {
      setT(
        access(state.craft as any, path, {
          getChildren: (node: CraftElement) =>
            "children" in node ? (node.children as any) : [],
        })
      );
    }
    // state.craft.children.find(
    //   (c) => c.type !== "viewport" && c.id === state.selectedNodes[0]
    // )
  }, [state.craft, state.craft.children, state.selectedNodes]);

  return t;
}

export function useInspectorElementColor() {
  //
}
