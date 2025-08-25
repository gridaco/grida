import cmath from "@grida/cmath";
import type { GeoNode } from "./hit-testing";

export interface GeoNodeBuilder {
  id: string;
  children: GeoNodeBuilder[];
  child(...nodes: GeoNodeBuilder[]): GeoNodeBuilder;
  bounds(x: number, y: number, width: number, height: number): GeoNodeBuilder;
  build(): GeoNode;
}

const defaultRect: cmath.Rectangle = { x: 0, y: 0, width: 0, height: 0 };

export function node(id: string): GeoNodeBuilder {
  let rect = { ...defaultRect };

  const builder: GeoNodeBuilder = {
    id,
    children: [],
    child(...kids: GeoNodeBuilder[]) {
      this.children.push(...kids);
      return this;
    },
    bounds(x: number, y: number, width: number, height: number) {
      rect = { x, y, width, height };
      return this;
    },
    build() {
      return {
        id,
        bounds: rect,
        children: this.children.map((c) => c.build()),
      };
    },
  };

  return builder;
}

