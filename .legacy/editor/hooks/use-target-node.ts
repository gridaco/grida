import { useEffect, useState } from "react";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type { DesignInput } from "@grida/builder-config/input";
import { useEditorState } from "core/states";
import { getTargetContainer } from "utils/get-target-node";

export function useTargetContainer(id?: string) {
  const [t, setT] = useState<{ target: ReflectSceneNode; root: DesignInput }>({
    target: undefined,
    root: undefined,
  });
  const [state] = useEditorState();

  useEffect(() => {
    if (id) {
      const { target, root } = getTargetContainer(state, id);
      setT({ target, root });
    } else {
      const { root, target } = getTargetContainer(state);
      setT({ target, root });
    }
  }, [state?.selectedNodes, state?.selectedPage, state?.design?.pages]);

  return t;
}
