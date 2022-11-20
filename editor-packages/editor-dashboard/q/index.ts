import type { FigmaReflectRepository } from "editor/core/states";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { groupByPath } from "./group-by-path-name";

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
): Map<string, Array<SceneMeta>> {
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

  const maps = design.pages.map((p) => {
    return groupByPath(p.children, {
      key: "name",
      base: p.name,
    });
  });

  // merge maps in to one
  const merged = maps.reduce((acc, map) => {
    return new Map([...acc, ...map]);
  }, new Map());

  return merged;
}
