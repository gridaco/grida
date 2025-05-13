import { FigmaReflectRepository } from "core/states";
import type { Canvas, FileResponse } from "@design-sdk/figma-remote-types";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";
import { visit } from "tree-visit";

export function pagesFrom(
  filekey: string,
  file: FileResponse
): FigmaReflectRepository["pages"] {
  return (file.document.children as Array<Canvas>).map((page) => ({
    id: page.id,
    name: page.name,
    children: page["children"]?.map((child) => {
      const _mapped = mapper.mapFigmaRemoteToFigma(child);
      return convert.intoReflectNode(_mapped, null, "rest", filekey);
    }),
    flowStartingPoints: page.flowStartingPoints,
    backgroundColor: page.backgroundColor,
    type: "canvas",
  }));
}

/**
 * only fetch in-file components. components from shared-library (external file) won't be loaded.
 * @param file
 * @returns
 */
export function componentsFrom(
  file: FileResponse
): FigmaReflectRepository["components"] {
  const tomap = (a, v) => ({ ...a, [v.id]: v });

  // only fetch in-file components. components from shared-library (external file) won't be loaded.
  const components_in_file = [];
  visit<{ id: string; type: string }>(file.document, {
    getChildren: (node, indexPath) => {
      if ("children" in node)
        return node["children"] as Array<{ id: string; type: string }>;
      return [];
    },
    onEnter: (node) => {
      if (node["type"] == "COMPONENT") {
        components_in_file.push(node);
      }
    },
  });

  // return components_in_file.reduce(tomap, {});

  return Object.keys(file.components)
    .map((k) => {
      const id = k;
      const meta = file.components[k];
      const master = components_in_file.find((c) => c.id === id);
      if (!master) return;
      return {
        key: meta.key, // only available with api response. the hash key of current version of component for another api call. (not used)
        id: master.id,
        name: master.name,
        ...master,
      };
    })
    .filter((c) => c)
    .reduce(tomap, {});
}

export const selectedPage = (
  prevstate,
  pages: { id: string }[],
  selectedNodes: string[]
) => {
  if (prevstate && prevstate.selectedPage) {
    return prevstate.selectedPage;
  }

  if (selectedNodes && pages) {
    return selectedNodes.length > 0
      ? pages.find((page) => {
          return isChildrenOf(selectedNodes[0], page);
        })?.id ?? null
      : // find page of current selection.
        null;
  }

  return pages?.[0].id ?? null; // otherwise, return first page.
};

type Tree = {
  readonly id: string;
  readonly children?: ReadonlyArray<Tree>;
};

function isChildrenOf(child: string, parent: Tree) {
  if (!parent) return false;
  if (child === parent.id) return true;
  if (parent.children?.length === 0) return false;
  return parent.children?.some((c) => isChildrenOf(child, c)) ?? false;
}
