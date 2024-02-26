import type {
  DesignRepository,
  FigmaReflectRepository,
} from "editor/core/states";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { groupByPath } from "./group-by-path-name";

type SceneMeta<T extends string = string> = {
  id: string;
  name: string;
  type: T;
  width: number;
  height: number;
};

export function group<T extends SceneMeta>(
  design: DesignRepository,
  { filter: query }: { filter: string }
): Map<string, Array<T>> {
  // group by...
  // 1. path split by "/"
  // 2. type

  const maps = design.pages.map((p) => {
    return groupByPath(
      filter(p.children, {
        query,
      }),
      {
        key: "name",
        base: p.name,
      }
    );
  });

  // merge maps in to one
  const merged = maps.reduce((acc, map) => {
    return new Map([...acc, ...map]);
  }, new Map());

  return merged;
}

function filter(scenes: ReflectSceneNode[], { query }: { query: string }) {
  scenes = scenes.filter(Boolean);

  if (query) {
    // query by name first, since it's more efficient
    scenes = scenes.filter((s) =>
      s.name.toLowerCase().includes(query?.toLowerCase() || "")
    );
  }

  scenes = scenes.filter(
    (s: ReflectSceneNode) =>
      (s.origin === "FRAME" ||
        s.origin === "COMPONENT" ||
        s.origin === "COMPONENT_SET") &&
      s.visible &&
      s.children.length > 0
  );

  return scenes;
}
