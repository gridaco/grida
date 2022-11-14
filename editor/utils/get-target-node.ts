import type { EditorState } from "core/states";
import { DesignInput } from "@grida/builder-config/input";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import q from "@design-sdk/query";

export function getTargetContainer(state: EditorState, target?: string) {
  const { pages, selectedPage } = state;

  // validators
  if (!state.design) {
    return {
      root: null,
      target: null,
    };
  }

  // init search pool
  let searchpool;
  const page = pages.find((p) => p.id === selectedPage);
  if (page?.type === "figma-canvas") {
    searchpool = state.selectedPage
      ? state.design.pages.find((p) => p.id == state.selectedPage).children
      : null;
  } else {
    searchpool = state.design.pages.map((p) => p.children).flat();
  }

  // init target id
  let targetId: string = target;
  if (!targetId) {
    targetId =
      state?.selectedNodes?.length === 1 ? state.selectedNodes[0] : null;
  }

  if (!targetId) {
    return { target: null, root: null };
  }

  try {
    const { root: container_of_target } =
      q.getNodeAndRootByIdFrom<ReflectSceneNode>(targetId, searchpool) || null;

    const root = searchpool
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
  } catch (_) {}

  return { target: null, root: null };
}

export function getPageNode(of: string, from: EditorState) {
  const pages = from.design.pages;

  // loop trough pages's children recursively until find the node.

  const find_recursively = (node: { id: string; children: any }) => {
    if (node.id === of) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = find_recursively(child);
        if (found) {
          return found;
        }
      }
    }
  };

  for (const page of pages) {
    const found = find_recursively(page);
    if (found) {
      return page;
    }
  }

  return null;
}
