import { produce, type Draft } from "immer";
import type grida from "@grida/schema";
import type { NodeChangeAction } from "../action";
import type cg from "@grida/cg";
import { v4 } from "uuid";
import assert from "assert";
import cmath from "@grida/cmath";

function defineNodeProperty<
  K extends keyof grida.program.nodes.UnknwonNode,
>(handlers: {
  assert?: (node: grida.program.nodes.UnknwonNode) => boolean;
  apply: (
    draft: grida.program.nodes.UnknownNodeProperties,
    value: NonNullable<grida.program.nodes.UnknwonNode[K]>,
    prev?: grida.program.nodes.UnknwonNode[K]
  ) => void;
}) {
  return handlers;
}

/**
 * properties without side effects (re-layout)
 */
const safe_properties: Partial<
  Omit<
    grida.program.nodes.UnknownNodeProperties<{
      assert?: (node: grida.program.nodes.UnknwonNode) => boolean;
      apply: (
        draft: grida.program.nodes.UnknownNodeProperties,
        value: any,
        prev?: any
      ) => void;
    }>,
    "type"
  >
> = {
  active: defineNodeProperty<"active">({
    assert: (node) => typeof node.active === "boolean",
    apply: (draft, value, prev) => {
      draft.active = value;
    },
  }),
  locked: defineNodeProperty<"locked">({
    assert: (node) => typeof node.locked === "boolean",
    apply: (draft, value, prev) => {
      draft.locked = value;
    },
  }),
  name: defineNodeProperty<"name">({
    assert: (node) => typeof node.name === "string",
    apply: (draft, value, prev) => {
      draft.name = value;
    },
  }),
  position: defineNodeProperty<"position">({
    apply: (draft, value, prev) => {
      draft.position = value;
    },
  }),
  left: defineNodeProperty<"left">({
    apply: (draft, value, prev) => {
      draft.left = value;
    },
  }),
  top: defineNodeProperty<"top">({
    apply: (draft, value, prev) => {
      draft.top = value;
    },
  }),
  right: defineNodeProperty<"right">({
    apply: (draft, value, prev) => {
      draft.right = value;
    },
  }),
  bottom: defineNodeProperty<"bottom">({
    apply: (draft, value, prev) => {
      draft.bottom = value;
    },
  }),
  width: defineNodeProperty<"width">({
    apply: (draft, value, prev) => {
      if (typeof value === "number") {
        draft.width = ranged(0, value);
      } else {
        draft.width = value;
      }
    },
  }),
  height: defineNodeProperty<"height">({
    apply: (draft, value, prev) => {
      if (typeof value === "number") {
        draft.height = ranged(0, value);
      } else {
        draft.height = value;
      }
    },
  }),
  rotation: defineNodeProperty<"rotation">({
    assert: (node) => typeof node.rotation === "number",
    apply: (draft, value, prev) => {
      draft.rotation = value;
    },
  }),
  href: defineNodeProperty<"href">({
    assert: (node) => typeof node.href === "string",
    apply: (draft, value, prev) => {
      draft.href = value;
    },
  }),
  target: defineNodeProperty<"target">({
    assert: (node) => typeof node.target === "string",
    apply: (draft, value, prev) => {
      draft.target = value;
    },
  }),
  cursor: defineNodeProperty<"cursor">({
    assert: (node) => typeof node.cursor === "string",
    apply: (draft, value, prev) => {
      draft.cursor = value;
    },
  }),
  src: defineNodeProperty<"src">({
    assert: (node) => typeof node.src === "string",
    apply: (draft, value, prev) => {
      draft.src = value;
    },
  }),
  opacity: defineNodeProperty<"opacity">({
    assert: (node) => typeof node.opacity === "number",
    apply: (draft, value, prev) => {
      draft.opacity = ranged(0, value, 1);
    },
  }),
  blendMode: defineNodeProperty<"blendMode">({
    assert: (node) => typeof node.blendMode === "string",
    apply: (draft, value, prev) => {
      draft.blendMode = value;
    },
  }),
  fill: defineNodeProperty<"fill">({
    assert: (node) =>
      node.type === "svgpath" ||
      node.type === "path" ||
      node.type === "image" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "text" ||
      node.type === "richtext" ||
      node.type === "container" ||
      node.type === "component",
    apply: (draft, value, prev) => {
      if (value === null) {
        draft.fill = undefined;
        return;
      }

      switch (value.type) {
        case "linear_gradient":
        case "radial_gradient":
        case "sweep_gradient":
        case "diamond_gradient":
          draft.fill = {
            ...(value as
              | cg.LinearGradientPaint
              | cg.RadialGradientPaint
              | cg.SweepGradientPaint),
          };
          break;
        case "solid":
          draft.fill = value as
            | grida.program.nodes.i.props.SolidPaintToken
            | cg.SolidPaint;
          break;
      }
    },
  }),
  cornerRadius: defineNodeProperty<"cornerRadius">({
    apply: (draft, value, prev) => {
      // TODO: make [cornerRadius < (Math.min(width, height) / 2)]
      draft.cornerRadius = value;
    },
  }),
  cornerRadiusTopLeft: defineNodeProperty<"cornerRadiusTopLeft">({
    apply: (draft, value, prev) => {
      draft.cornerRadiusTopLeft = value;
    },
  }),
  cornerRadiusTopRight: defineNodeProperty<"cornerRadiusTopRight">({
    apply: (draft, value, prev) => {
      draft.cornerRadiusTopRight = value;
    },
  }),
  cornerRadiusBottomRight: defineNodeProperty<"cornerRadiusBottomRight">({
    apply: (draft, value, prev) => {
      draft.cornerRadiusBottomRight = value;
    },
  }),
  cornerRadiusBottomLeft: defineNodeProperty<"cornerRadiusBottomLeft">({
    apply: (draft, value, prev) => {
      draft.cornerRadiusBottomLeft = value;
    },
  }),
  pointCount: defineNodeProperty<"pointCount">({
    assert: (node) => typeof node.pointCount === "number",
    apply: (draft, value, prev) => {
      draft.pointCount = cmath.clamp(value, 3, 60);
    },
  }),
  innerRadius: defineNodeProperty<"innerRadius">({
    assert: (node) => typeof node.innerRadius === "number",
    apply: (draft, value, prev) => {
      draft.innerRadius = cmath.clamp(value, 0, 1);
    },
  }),
  angle: defineNodeProperty<"angle">({
    assert: (node) => typeof node.angle === "number",
    apply: (draft, value, prev) => {
      draft.angle = cmath.clamp(value, 0, 360);
    },
  }),
  angleOffset: defineNodeProperty<"angleOffset">({
    assert: (node) => typeof node.angleOffset === "number",
    apply: (draft, value, prev) => {
      draft.angleOffset = cmath.clamp(value, 0, 360);
    },
  }),
  border: defineNodeProperty<"border">({
    assert: (node) =>
      // node.type === "text" ||
      node.type === "image" ||
      node.type === "video" ||
      node.type === "container" ||
      node.type === "component",
    apply: (draft, value, prev) => {
      draft.border = value;
    },
  }),
  stroke: defineNodeProperty<"stroke">({
    assert: (node) =>
      node.type === "path" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse",
    apply: (draft, value, prev) => {
      if (value === null) {
        draft.stroke = undefined;
        return;
      }

      switch (value.type) {
        case "linear_gradient":
        case "radial_gradient":
          draft.stroke = {
            ...(value as cg.LinearGradientPaint | cg.RadialGradientPaint),
          };
          break;
        case "solid":
          draft.stroke = value as
            | grida.program.nodes.i.props.SolidPaintToken
            | cg.SolidPaint;
          break;
      }
    },
  }),
  strokeWidth: defineNodeProperty<"strokeWidth">({
    assert: (node) =>
      node.type === "path" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse",
    apply: (draft, value, prev) => {
      draft.strokeWidth = ranged(0, value);
    },
  }),
  strokeAlign: defineNodeProperty<"strokeAlign">({
    assert: (node) =>
      node.type === "path" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse",
    apply: (draft, value, prev) => {
      draft.strokeAlign = value;
    },
  }),
  strokeCap: defineNodeProperty<"strokeCap">({
    apply: (draft, value, prev) => {
      draft.strokeCap = value;
    },
  }),
  feShadows: defineNodeProperty<"feShadows">({
    apply: (draft, value, prev) => {
      draft.feShadows = value;
    },
  }),
  feBlur: defineNodeProperty<"feBlur">({
    apply: (draft, value, prev) => {
      draft.feBlur = value;
    },
  }),
  feBackdropBlur: defineNodeProperty<"feBackdropBlur">({
    apply: (draft, value, prev) => {
      draft.feBackdropBlur = value;
    },
  }),
  zIndex: defineNodeProperty<"zIndex">({
    assert: (node) => typeof node.zIndex === "number",
    apply: (draft, value, prev) => {
      draft.zIndex = value;
    },
  }),
  fit: defineNodeProperty<"fit">({
    assert: (node) => node.type === "image",
    apply: (draft, value, prev) => {
      draft.fit = value;
    },
  }),
  padding: defineNodeProperty<"padding">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      draft.padding = value;
    },
  }),
  layout: defineNodeProperty<"layout">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      draft.layout = value;
      if (prev !== "flex" && value === "flex") {
        // initialize flex layout
        // each property cannot be undefined, but for older version compatibility, we need to set default value (only when not set)
        if (!draft.direction) draft.direction = "horizontal";
        if (!draft.mainAxisAlignment) draft.mainAxisAlignment = "start";
        if (!draft.crossAxisAlignment) draft.crossAxisAlignment = "start";
        if (!draft.mainAxisGap) draft.mainAxisGap = 0;
        if (!draft.crossAxisGap) draft.crossAxisGap = 0;
      }
    },
  }),
  direction: defineNodeProperty<"direction">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      draft.direction = value;
    },
  }),
  mainAxisAlignment: defineNodeProperty<"mainAxisAlignment">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      draft.mainAxisAlignment = value;
    },
  }),
  crossAxisAlignment: defineNodeProperty<"crossAxisAlignment">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      draft.crossAxisAlignment = value;
    },
  }),
  mainAxisGap: defineNodeProperty<"mainAxisGap">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      draft.mainAxisGap = value;
    },
  }),
  crossAxisGap: defineNodeProperty<"crossAxisGap">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      draft.crossAxisGap = value;
    },
  }),
  textAlign: defineNodeProperty<"textAlign">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.textAlign = value;
    },
  }),
  textAlignVertical: defineNodeProperty<"textAlignVertical">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.textAlignVertical = value;
    },
  }),
  fontWeight: defineNodeProperty<"fontWeight">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.fontWeight = value;
    },
  }),
  fontSize: defineNodeProperty<"fontSize">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.fontSize = ranged(1, value);
    },
  }),
  lineHeight: defineNodeProperty<"lineHeight">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.lineHeight = value;
    },
  }),
  letterSpacing: defineNodeProperty<"letterSpacing">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.letterSpacing = value;
    },
  }),
  maxLength: defineNodeProperty<"maxLength">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.maxLength = value;
    },
  }),
  text: defineNodeProperty<"text">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.text = value ?? null;
    },
  }),
  userdata: defineNodeProperty<"userdata">({
    apply: (draft, value, prev) => {
      assert(
        value === undefined ||
          value === null ||
          (typeof value === "object" && !Array.isArray(value)),
        "userdata must be an k:v object"
      );
      draft.userdata = value;
    },
  }),
};

function applyNodeProperty<K extends keyof grida.program.nodes.UnknwonNode>(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: K,
  value: grida.program.nodes.UnknwonNode[K]
) {
  if (!(key in safe_properties)) {
    throw new Error(`property handler not found: "${key}"`);
  }
  const property = safe_properties[key as keyof typeof safe_properties];
  if (property) {
    const prev = (draft as any)[key];
    // TODO: assert - decide pre or after
    property.apply(draft, value, prev);
  }
}

export default function nodeReducer<
  N extends Partial<grida.program.nodes.Node>,
>(node: N, action: NodeChangeAction): N {
  return produce(node, (draft) => {
    switch (action.type) {
      case "node/change/*": {
        const { type: _, node_id: __, ...values } = action;
        for (const [key, value] of Object.entries(values)) {
          applyNodeProperty(
            draft as grida.program.nodes.UnknownNodeProperties,
            key as keyof grida.program.nodes.UnknwonNode,
            value
          );
        }
        break;
      }
      // keep
      case "node/change/positioning": {
        const pos = draft as grida.program.nodes.i.IPositioning;
        if ("position" in action) {
          if (action.position) {
            pos.position = action.position;
          }
        }
        if ("left" in action) pos.left = action.left;
        if ("top" in action) pos.top = action.top;
        if ("right" in action) pos.right = action.right;
        if ("bottom" in action) pos.bottom = action.bottom;
        break;
      }
      // keep
      case "node/change/positioning-mode": {
        const { position } = action;
        (draft as grida.program.nodes.i.IPositioning).position = position;
        switch (position) {
          case "absolute": {
            break;
          }
          case "relative": {
            (draft as grida.program.nodes.i.IPositioning).left = undefined;
            (draft as grida.program.nodes.i.IPositioning).top = undefined;
            (draft as grida.program.nodes.i.IPositioning).right = undefined;
            (draft as grida.program.nodes.i.IPositioning).bottom = undefined;
          }
        }
        break;
      }
      case "node/change/component": {
        assert(draft.type === "instance");
        draft.component_id = action.component_id;
        break;
      }
      case "node/change/props": {
        assert(draft.type === "instance" || draft.type === "template_instance");
        draft.props = Object.assign({}, draft.props, action.props);
        break;
      }
      case "node/change/style": {
        // assert(draft.type !== 'template_instance')
        (draft as Draft<grida.program.nodes.i.ICSSStylable>).style =
          Object.assign(
            {},
            (draft as Draft<grida.program.nodes.i.ICSSStylable>).style,
            action.style
          );
        break;
      }
      case "node/change/fontFamily": {
        assert(draft.type === "text");
        draft.fontFamily = action.fontFamily;
        break;
      }

      default: {
        throw new Error(
          `unknown action type: "${(action as NodeChangeAction).type as string}"`
        );
      }
    }
  });
}

const ranged = (min: number, value: number, max?: number) => {
  if (max === undefined) {
    return Math.max(min, value);
  }
  return Math.min(Math.max(value, min), max);
};
