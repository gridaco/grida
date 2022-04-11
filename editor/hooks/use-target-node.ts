import { useEffect, useState } from "react";
import type { ReflectSceneNode } from "@design-sdk/core";
import type { DesignInput } from "@designto/config/input";
import { useEditorState } from "core/states";
import { getTargetContainer } from "utils/get-target-node";

export function useTargetContainer() {
  const [t, setT] = useState<{ target: ReflectSceneNode; root: DesignInput }>({
    target: undefined,
    root: undefined,
  });
  const [state] = useEditorState();

  useEffect(() => {
    const { root, target } = getTargetContainer(state);
    setT({ target, root });
  }, [state?.selectedNodes, state?.selectedPage, state?.design?.pages]);

  return t;
}
