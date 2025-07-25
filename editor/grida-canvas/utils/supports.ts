import { editor } from "@/grida-canvas";
import type grida from "@grida/schema";

type NodeType = grida.program.nodes.NodeType;

type Renderer =
  | "grida-canvas-wasm"
  | "grida-canvas-dom"
  | "grida-canvas-dom-svg";

type Feature =
  | "arcData"
  | "cornerRadius"
  | "cornerRadius4"
  | "border"
  | "children"
  | "stroke"
  | "feDropShadow"
  | "strokeCap";

type INodePropertiesConfig = {
  opacity: boolean;
  blend_mode: boolean;
  corner_radius: boolean;
  css_border: boolean;
  css_stroke: boolean;
  children: boolean;
  strokes: boolean;
  stroke_cap: boolean;
  effects: {
    multiple: boolean;
    box_shadow: boolean;
  };
};

const GRIDA_TCANVAS_RECTANGLE_NODE: INodePropertiesConfig = {
  opacity: true,
  blend_mode: true,
  corner_radius: true,
  css_border: false,
  css_stroke: true,
  children: false,
  strokes: true,
  stroke_cap: false,
  effects: {
    multiple: true,
    box_shadow: true,
  },
};

const dom_supports: Record<Feature, ReadonlyArray<NodeType>> = {
  arcData: ["ellipse"],
  cornerRadius: [
    "rectangle",
    "image",
    "video",
    "container",
    "component",
    "instance",
  ],
  cornerRadius4: [
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
  feDropShadow: ["container", "component", "instance"],
  /**
   * strokeCap value itself is supported by all istroke nodes, yet it should be visible to editor only for polyline and line nodes. (path-like nodes)
   */
  strokeCap: ["path", "line"],
} as const;

const canvas_supports: Record<Feature, ReadonlyArray<NodeType>> = {
  arcData: ["ellipse"],
  cornerRadius: [
    "rectangle",
    "polygon",
    "star",
    "image",
    "video",
    "container",
    "component",
    "instance",
  ],
  cornerRadius4: [
    "rectangle",
    "image",
    "video",
    "container",
    "component",
    "instance",
  ],
  border: [],
  children: ["container", "component", "instance"],
  stroke: [
    "container",
    "rectangle",
    "image",
    "video",
    "container",
    "path",
    "line",
    "rectangle",
    "ellipse",
    "polygon",
    "star",
    "component",
    "instance",
  ],
  feDropShadow: [
    "container",
    "rectangle",
    "image",
    "video",
    "instance",
    "path",
    "line",
    "rectangle",
    "ellipse",
    "polygon",
    "star",
    "container",
    "component",
  ],
  strokeCap: ["path", "line"],
} as const;

type Context = {
  backend: editor.EditorContentRenderingBackend;
};

export namespace supports {
  export const arcData = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.arcData.includes(type);
      case "canvas":
        return canvas_supports.arcData.includes(type);
    }
  };
  export const cornerRadius = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.cornerRadius.includes(type);
      case "canvas":
        return canvas_supports.cornerRadius.includes(type);
    }
  };
  export const cornerRadius4 = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.cornerRadius4.includes(type);
      case "canvas":
        return canvas_supports.cornerRadius4.includes(type);
    }
  };
  export const border = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.border.includes(type);
      case "canvas":
        return canvas_supports.border.includes(type);
    }
  };
  export const children = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.children.includes(type);
      case "canvas":
        return canvas_supports.children.includes(type);
    }
  };
  export const stroke = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.stroke.includes(type);
      case "canvas":
        return canvas_supports.stroke.includes(type);
    }
  };
  export const strokeCap = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.strokeCap.includes(type);
      case "canvas":
        return canvas_supports.strokeCap.includes(type);
    }
  };
  export const feDropShadow = (type: NodeType, context: Context) => {
    switch (context.backend) {
      case "dom":
        return dom_supports.feDropShadow.includes(type);
      case "canvas":
        return canvas_supports.feDropShadow.includes(type);
    }
  };
}

export const is_direct_component_consumer = (type: NodeType) => {
  return (
    type === "component" || type === "instance" || type === "template_instance"
  );
};
