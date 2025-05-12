import type grida from "@grida/schema";

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
  border: ["container", "component", "instance", "image", "video"],
  children: ["container", "component", "instance"],
  stroke: ["path", "line", "rectangle", "ellipse"],
  boxShadow: ["container", "component", "instance"],
  /**
   * strokeCap value itself is supported by all istroke nodes, yet it should be visible to editor only for polyline and line nodes. (path-like nodes)
   */
  strokeCap: ["path", "line"],
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
  export const boxShadow = (type: NodeType) =>
    __supports.boxShadow.includes(type);
}

export const is_direct_component_consumer = (type: NodeType) => {
  return (
    type === "component" || type === "instance" || type === "template_instance"
  );
};
