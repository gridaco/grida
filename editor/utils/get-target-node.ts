import type { EditorState } from "core/states";
import { DesignInput } from "@grida/builder-config/input";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import q from "@design-sdk/query";

export function getTargetContainer(state: EditorState) {
  const thisPageNodes = state.selectedPage
    ? state.design.pages.find((p) => p.id == state.selectedPage).children
    : null;

  const targetId =
    state?.selectedNodes?.length === 1 ? state.selectedNodes[0] : null;

  if (!targetId) {
    return { target: null, root: null };
  }

  const { root: container_of_target } =
    q.getNodeAndRootByIdFrom<ReflectSceneNode>(targetId, thisPageNodes) || null;

  const root = thisPageNodes
    ? container_of_target &&
      (container_of_target.origin === "COMPONENT"
        ? DesignInput.forMasterComponent({
            master: container_of_target,
            all: state.design.pages,
            components: state.design.components,
          })
        : DesignInput.fromDesignWithComponents({
            design: container_of_target,
            components: state.design.components,
          }))
    : state.design?.input;

  const target = q.getNodeByIdFrom(targetId, root?.entry) ?? root?.entry;
  return { root, target };
}
