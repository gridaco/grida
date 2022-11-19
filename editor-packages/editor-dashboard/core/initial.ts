import type { FigmaReflectRepository } from "editor/core/states";
import type {
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

  const sections = Array.from(grouped.keys()).map((k) => {
    const items = grouped.get(k);
    return <DashboardSection>{
      name: k,
      items: items,
    };
  });

  const components = Object.values(design.components)
    .filter(Boolean)
    .map((c) => ({
      $type: "component" as const,
      ...c,
    }));

  return {
    sections,
    components: components,
  };
}
