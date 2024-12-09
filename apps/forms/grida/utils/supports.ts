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
} as const;

export namespace supports {
  export const cornerRadius = (type: NodeType) =>
    __supports.cornerRadius.includes(type);
  export const border = (type: NodeType) => __supports.border.includes(type);
  export const children = (type: NodeType) =>
    __supports.children.includes(type);
}
