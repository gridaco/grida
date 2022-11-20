import type { FigmaReflectRepository } from "editor/core/states";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import type {
  ComponentItem,
  DashboardFolderItem,
  DashboardHierarchy,
  DashboardState,
} from "./state";
import { group } from "../q";

export function initialDashboardState(
  design: FigmaReflectRepository
): DashboardState {
  const hierarchy = initialHierarchy(design);
  return {
    selection: [],
    filter: {
      query: "",
    },
    hierarchy: hierarchy,
    hierarchyFoldings: [],
  };
}

export function initialHierarchy(
  design: FigmaReflectRepository
): DashboardHierarchy {
  //

  const grouped = group<ReflectSceneNode>(design, { filter: null });

  const sections: Array<DashboardFolderItem> = Array.from(grouped.keys()).map(
    (k): DashboardFolderItem => {
      const items = grouped.get(k);
      return {
        id: k,
        $type: "folder",
        name: k,
        path: k,
        contents: items.map((i) => ({
          $type: "frame-scene",
          id: i.id,
          scene: i,
          name: i.name,
          path: k + "/" + i.name,
          type: "FRAME",
          width: i.width,
          height: i.height,
        })),
      };
    }
  );

  const components: Array<ComponentItem> = Object.values(design.components)
    .filter(Boolean)
    .map((c) => ({
      ...c,
      type: "COMPONENT",
      path: "components" + "/" + c.id,
      $type: "component" as const,
    }));

  return {
    sections,
    components: components,
  };
}
