import { useEffect, useState } from "react";
import { useEditorState } from "core/states";
import { CraftElement } from "@code-editor/craft";

export function useInspectorElement() {
  const [t, setT] = useState<CraftElement>();
  const [state] = useEditorState();

  useEffect(() => {
    setT(
      state.craft.children.find(
        (c) => c.type !== "viewport" && c.id === state.selectedNodes[0]
      )
    );
  }, [state.craft.children, state.selectedNodes]);

  return t;
}

export function useInspectorElementColor() {
  //
}
