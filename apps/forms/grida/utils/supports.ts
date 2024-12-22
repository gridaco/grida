import type { grida } from "..";

type NodeType = grida.program.nodes.NodeType;

const __supports: Record<string, ReadonlyArray<NodeType>> = {
  cornerRadius: [
    "rectangle",
    "image",
    "video",
    "container",
    "component",
    "instance",
  ],
  border: ["container", "component", "instance"],
  children: ["container", "component", "instance"],
  stroke: ["polyline", "line", "rectangle", "ellipse"],
  /**
   * strokeCap value itself is supported by all istroke nodes, yet it should be visible to editor only for polyline and line nodes. (path-like nodes)
   */
  strokeCap: ["polyline", "line"],
} as const;

export namespace supports {
  export const cornerRadius = (type: NodeType) =>
    __supports.cornerRadius.includes(type);
  export const border = (type: NodeType) => __supports.border.includes(type);
  export const children = (type: NodeType) =>
    __supports.children.includes(type);
  export const stroke = (type: NodeType) => __supports.stroke.includes(type);
  export const strokeCap = (type: NodeType) =>
    __supports.strokeCap.includes(type);
}
