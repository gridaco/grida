import type { FigmaReflectRepository } from "editor/core/states";
import type { ReflectSceneNode } from "@design-sdk/figma-node";

type SceneMeta<T extends string = string> = {
  id: string;
  name: string;
  type: T;
  width: number;
  height: number;
};

export function group(
  design: FigmaReflectRepository,
  { filter }: { filter: string }
) {
  // group by...
  // 1. path split by "/"
  // 2. type

  let scenes: ReadonlyArray<ReflectSceneNode> = design.pages
    .reduce((acc, page) => {
      return acc.concat(page.children);
    }, [])
    .filter(Boolean);

  if (filter) {
    // query by name first, since it's more efficient
    scenes = scenes.filter((s) =>
      s.name.toLowerCase().includes(filter?.toLowerCase() || "")
    );
  }

  scenes.filter(
    (s: ReflectSceneNode) =>
      (s.origin === "FRAME" ||
        s.origin === "COMPONENT" ||
        s.origin === "COMPONENT_SET") &&
      s.visible &&
      s.children.length > 0
  );

  const map = groupByPath(scenes);
  return map;
}

/**
 * @example
 * ["a", "/", "/a", "/b", "/", "/a/b", "/a/a"]
 * => {"a": ["a"], "/": ["/", "/a" ,"/b", "/"], "/a": ["/a/b", "/a/a"]}
 */
function groupByPath(nodes: ReadonlyArray<SceneMeta>) {
  const map = new Map<string, SceneMeta[]>();
  for (const node of nodes) {
    const path = node.name.split("/");
    let currentPath = "";
    for (const p of path) {
      currentPath += p;
      const arr = map.get(currentPath) || [];
      arr.push(node);
      map.set(currentPath, arr);
      currentPath += "/";
    }
  }
  return map;
}
