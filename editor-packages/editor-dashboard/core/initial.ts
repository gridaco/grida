import type { FigmaReflectRepository } from "editor/core/states";
import type {
  ComponentItem,
  DashboardHierarchy,
  DashboardSection,
  DashboardState,
} from "./state";
import { group } from "../q";

export function initialDashboardState(
  design: FigmaReflectRepository
): DashboardState {
  return {
    selection: [],
    filter: {
      query: "",
    },
    hierarchy: initialHierarchy(design),
  };
}

export function initialHierarchy(
  design: FigmaReflectRepository
): DashboardHierarchy {
  //

  const grouped = group(design, { filter: null });

  const sections: Array<DashboardSection> = Array.from(grouped.keys()).map(
    (k): DashboardSection => {
      const items = grouped.get(k);
      return {
        name: k,
        path: k,
        items: items.map((i) => ({
          ...i,
          type: "FRAME",
          $type: "frame-scene",
          path: k + "/" + i.name,
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
