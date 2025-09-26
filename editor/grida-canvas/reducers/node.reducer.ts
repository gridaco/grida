import { type Draft } from "immer";
import { produceWithHistory as produce } from "./history/patches";
import type grida from "@grida/schema";
import type { NodeChangeAction } from "../action";
import type cg from "@grida/cg";
import assert from "assert";
import cmath from "@grida/cmath";
import { editor } from "@/grida-canvas";

type UN = grida.program.nodes.UnknwonNode;
type DYN_TODO = grida.program.nodes.UnknwonNode | any; // TODO: remove casting of this usage.

type PaintValue = grida.program.nodes.i.props.PropsPaintValue;

function normalizePaintValue(paint: PaintValue): PaintValue {
  if (!paint || typeof paint !== "object") {
    return paint;
  }

  if (!("type" in paint)) {
    return paint;
  }

  switch (paint.type) {
    case "solid":
    case "image":
    case "linear_gradient":
    case "radial_gradient":
    case "sweep_gradient":
    case "diamond_gradient":
      return { ...paint } as PaintValue;
    default:
      return paint;
  }
}

// TODO: LEGACY_PAINT_MODEL
function readPaints(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke"
): PaintValue[] {
  const pluralKey = key === "fill" ? "fills" : "strokes";
  const paints: PaintValue[] = [];
  const existing = (draft as any)[pluralKey] as PaintValue[] | undefined;

  if (Array.isArray(existing) && existing.length > 0) {
    for (const paint of existing) {
      if (paint) {
        paints.push(normalizePaintValue(paint));
      }
    }
    return paints;
  }

  const single = (draft as any)[key] as PaintValue | undefined;
  if (single) {
    paints.push(normalizePaintValue(single));
  }

  return paints;
}

// TODO: LEGACY_PAINT_MODEL
function writePaints(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke",
  paints: PaintValue[]
) {
  const pluralKey = key === "fill" ? "fills" : "strokes";

  if (!paints || paints.length === 0) {
    (draft as any)[pluralKey] = undefined;
    (draft as any)[key] = undefined;
    return;
  }

  const normalized = paints.map((paint) => normalizePaintValue(paint));
  (draft as any)[pluralKey] = normalized;
  (draft as any)[key] = normalized[0];
}

function applyPaintAtIndex(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke",
  index: number,
  paint: PaintValue | null | undefined
) {
  const paints = readPaints(draft, key);

  if (paint === null || typeof paint === "undefined") {
    if (index < 0 || index >= paints.length) {
      return;
    }
    paints.splice(index, 1);
  } else {
    const normalized = normalizePaintValue(paint);
    if (index < 0) {
      return;
    }
    if (index < paints.length) {
      paints[index] = normalized;
    } else if (index === paints.length) {
      paints.push(normalized);
    } else if (paints.length === 0 && index === 0) {
      paints.push(normalized);
    } else {
      return;
    }
  }

  writePaints(draft, key, paints);
}

function insertPaintAtIndex(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke",
  index: number,
  paint: PaintValue
) {
  const paints = readPaints(draft, key);
  const normalized = normalizePaintValue(paint);

  if (index < 0 || index > paints.length) {
    return;
  }

  paints.splice(index, 0, normalized);
  writePaints(draft, key, paints);
}

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
      (draft as UN).active = value;
    },
  }),
  locked: defineNodeProperty<"locked">({
    assert: (node) => typeof node.locked === "boolean",
    apply: (draft, value, prev) => {
      (draft as UN).locked = value;
    },
  }),
  name: defineNodeProperty<"name">({
    assert: (node) => typeof node.name === "string",
    apply: (draft, value, prev) => {
      (draft as UN).name = value;
    },
  }),
  position: defineNodeProperty<"position">({
    apply: (draft, value, prev) => {
      (draft as UN).position = value;
    },
  }),
  left: defineNodeProperty<"left">({
    apply: (draft, value, prev) => {
      (draft as UN).left = value;
    },
  }),
  top: defineNodeProperty<"top">({
    apply: (draft, value, prev) => {
      (draft as UN).top = value;
    },
  }),
  right: defineNodeProperty<"right">({
    apply: (draft, value, prev) => {
      (draft as UN).right = value;
    },
  }),
  bottom: defineNodeProperty<"bottom">({
    apply: (draft, value, prev) => {
      (draft as UN).bottom = value;
    },
  }),
  width: defineNodeProperty<"width">({
    apply: (draft, value, prev) => {
      if (typeof value === "number") {
        draft.width = ranged(0, value);
      } else {
        (draft as UN).width = value;
      }
    },
  }),
  height: defineNodeProperty<"height">({
    apply: (draft, value, prev) => {
      if (typeof value === "number") {
        draft.height = ranged(0, value);
      } else {
        (draft as UN).height = value;
      }
    },
  }),
  rotation: defineNodeProperty<"rotation">({
    assert: (node) => typeof node.rotation === "number",
    apply: (draft, value, prev) => {
      (draft as UN).rotation = value;
    },
  }),
  href: defineNodeProperty<"href">({
    assert: (node) => typeof node.href === "string",
    apply: (draft, value, prev) => {
      (draft as UN).href = value;
    },
  }),
  target: defineNodeProperty<"target">({
    assert: (node) => typeof node.target === "string",
    apply: (draft, value, prev) => {
      (draft as UN).target = value;
    },
  }),
  cursor: defineNodeProperty<"cursor">({
    assert: (node) => typeof node.cursor === "string",
    apply: (draft, value, prev) => {
      (draft as UN).cursor = value;
    },
  }),
  src: defineNodeProperty<"src">({
    assert: (node) => typeof node.src === "string",
    apply: (draft, value, prev) => {
      (draft as UN).src = value;
    },
  }),
  opacity: defineNodeProperty<"opacity">({
    assert: (node) => typeof node.opacity === "number",
    apply: (draft, value, prev) => {
      (draft as UN).opacity = ranged(0, value, 1);
    },
  }),
  blendMode: defineNodeProperty<"blendMode">({
    assert: (node) => typeof node.blendMode === "string",
    apply: (draft, value, prev) => {
      (draft as UN).blendMode = value;
    },
  }),
  mask: defineNodeProperty<"mask">({
    assert: (node) => typeof node.mask === "string",
    apply: (draft, value, prev) => {
      (draft as UN).mask = value;
    },
  }),
  fill: defineNodeProperty<"fill">({
    assert: (node) =>
      node.type === "svgpath" ||
      node.type === "vector" ||
      node.type === "image" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "text" ||
      node.type === "richtext" ||
      node.type === "container" ||
      node.type === "component",
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const next = value as unknown as PaintValue | null;

      if (next === null) {
        writePaints(target, "fill", []);
        return;
      }

      writePaints(target, "fill", [next]);
    },
  }),
  fills: defineNodeProperty<"fills">({
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const paints = Array.isArray(value)
        ? (value as unknown as PaintValue[])
        : [];

      if (!paints.length) {
        writePaints(target, "fill", []);
        return;
      }

      writePaints(target, "fill", paints);
    },
  }),
  cornerRadius: defineNodeProperty<"cornerRadius">({
    apply: (draft, value, prev) => {
      // TODO: make [cornerRadius < (Math.min(width, height) / 2)]
      (draft as UN).cornerRadius = value;
    },
  }),
  cornerRadiusTopLeft: defineNodeProperty<"cornerRadiusTopLeft">({
    apply: (draft, value, prev) => {
      (draft as UN).cornerRadiusTopLeft = value;
    },
  }),
  cornerRadiusTopRight: defineNodeProperty<"cornerRadiusTopRight">({
    apply: (draft, value, prev) => {
      (draft as UN).cornerRadiusTopRight = value;
    },
  }),
  cornerRadiusBottomRight: defineNodeProperty<"cornerRadiusBottomRight">({
    apply: (draft, value, prev) => {
      (draft as UN).cornerRadiusBottomRight = value;
    },
  }),
  cornerRadiusBottomLeft: defineNodeProperty<"cornerRadiusBottomLeft">({
    apply: (draft, value, prev) => {
      (draft as UN).cornerRadiusBottomLeft = value;
    },
  }),
  pointCount: defineNodeProperty<"pointCount">({
    assert: (node) => typeof node.pointCount === "number",
    apply: (draft, value, prev) => {
      (draft as UN).pointCount = cmath.clamp(value, 3, 60);
    },
  }),
  innerRadius: defineNodeProperty<"innerRadius">({
    assert: (node) => typeof node.innerRadius === "number",
    apply: (draft, value, prev) => {
      (draft as UN).innerRadius = cmath.clamp(value, 0, 1);
    },
  }),
  angle: defineNodeProperty<"angle">({
    assert: (node) => typeof node.angle === "number",
    apply: (draft, value, prev) => {
      (draft as UN).angle = cmath.clamp(value, 0, 360);
    },
  }),
  angleOffset: defineNodeProperty<"angleOffset">({
    assert: (node) => typeof node.angleOffset === "number",
    apply: (draft, value, prev) => {
      (draft as UN).angleOffset = cmath.clamp(value, 0, 360);
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
      (draft as UN).border = value;
    },
  }),
  stroke: defineNodeProperty<"stroke">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "text",
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const next = value as unknown as PaintValue | null;

      if (next === null) {
        writePaints(target, "stroke", []);
        return;
      }

      writePaints(target, "stroke", [next]);
    },
  }),
  strokes: defineNodeProperty<"strokes">({
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const paints = Array.isArray(value)
        ? (value as unknown as PaintValue[])
        : [];

      if (!paints.length) {
        writePaints(target, "stroke", []);
        return;
      }

      writePaints(target, "stroke", paints);
    },
  }),
  strokeWidth: defineNodeProperty<"strokeWidth">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).strokeWidth = ranged(
        0,
        value,
        editor.config.DEFAULT_MAX_STROKE_WIDTH
      );
    },
  }),
  strokeAlign: defineNodeProperty<"strokeAlign">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).strokeAlign = value;
    },
  }),
  strokeCap: defineNodeProperty<"strokeCap">({
    apply: (draft, value, prev) => {
      (draft as UN).strokeCap = value;
    },
  }),
  feShadows: defineNodeProperty<"feShadows">({
    apply: (draft, value, prev) => {
      (draft as UN).feShadows = value?.map((s) => ({
        ...s,
        dx: ranged(
          -editor.config.DEFAULT_MAX_SHADOW_OFFSET,
          s.dx,
          editor.config.DEFAULT_MAX_SHADOW_OFFSET
        ),
        dy: ranged(
          -editor.config.DEFAULT_MAX_SHADOW_OFFSET,
          s.dy,
          editor.config.DEFAULT_MAX_SHADOW_OFFSET
        ),
        blur: ranged(0, s.blur, editor.config.DEFAULT_MAX_BLUR_RADIUS),
        spread: ranged(
          -editor.config.DEFAULT_MAX_SHADOW_SPREAD,
          s.spread,
          editor.config.DEFAULT_MAX_SHADOW_SPREAD
        ),
      }));
    },
  }),
  feBlur: defineNodeProperty<"feBlur">({
    apply: (draft, value, prev) => {
      if (value) {
        switch (value.type) {
          case "blur": {
            value = {
              ...value,
              radius: ranged(
                0,
                value.radius,
                editor.config.DEFAULT_MAX_BLUR_RADIUS
              ),
            };
            break;
          }
          case "progressive-blur": {
            value = {
              ...value,
              radius: ranged(
                0,
                value.radius,
                editor.config.DEFAULT_MAX_BLUR_RADIUS
              ),
              radius2: ranged(
                0,
                value.radius2,
                editor.config.DEFAULT_MAX_BLUR_RADIUS
              ),
            } as cg.FeProgressiveBlur;
            break;
          }
        }
      }
      (draft as UN).feBlur = value;
    },
  }),
  feBackdropBlur: defineNodeProperty<"feBackdropBlur">({
    apply: (draft, value, prev) => {
      if (value) {
        switch (value.type) {
          case "blur": {
            value = {
              ...value,
              radius: ranged(
                0,
                value.radius,
                editor.config.DEFAULT_MAX_BLUR_RADIUS
              ),
            };
            break;
          }
          case "progressive-blur": {
            value = {
              ...value,
              radius: ranged(
                0,
                value.radius,
                editor.config.DEFAULT_MAX_BLUR_RADIUS
              ),
              radius2: ranged(
                0,
                value.radius2,
                editor.config.DEFAULT_MAX_BLUR_RADIUS
              ),
            } as cg.FeProgressiveBlur;
            break;
          }
        }
      }
      (draft as UN).feBackdropBlur = value;
    },
  }),
  zIndex: defineNodeProperty<"zIndex">({
    assert: (node) => typeof node.zIndex === "number",
    apply: (draft, value, prev) => {
      (draft as UN).zIndex = value;
    },
  }),
  fit: defineNodeProperty<"fit">({
    assert: (node) => node.type === "image",
    apply: (draft, value, prev) => {
      (draft as UN).fit = value;
    },
  }),
  padding: defineNodeProperty<"padding">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).padding = value;
    },
  }),
  layout: defineNodeProperty<"layout">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).layout = value;
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
      (draft as UN).direction = value;
    },
  }),
  mainAxisAlignment: defineNodeProperty<"mainAxisAlignment">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).mainAxisAlignment = value;
    },
  }),
  crossAxisAlignment: defineNodeProperty<"crossAxisAlignment">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).crossAxisAlignment = value;
    },
  }),
  mainAxisGap: defineNodeProperty<"mainAxisGap">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).mainAxisGap = value;
    },
  }),
  crossAxisGap: defineNodeProperty<"crossAxisGap">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).crossAxisGap = value;
    },
  }),
  textAlign: defineNodeProperty<"textAlign">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textAlign = value;
    },
  }),
  textAlignVertical: defineNodeProperty<"textAlignVertical">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textAlignVertical = value;
    },
  }),
  textDecorationLine: defineNodeProperty<"textDecorationLine">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textDecorationLine = value;
    },
  }),
  textDecorationStyle: defineNodeProperty<"textDecorationStyle">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textDecorationStyle = value;
    },
  }),
  textDecorationColor: defineNodeProperty<"textDecorationColor">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textDecorationColor = value;
    },
  }),
  textDecorationSkipInk: defineNodeProperty<"textDecorationSkipInk">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textDecorationSkipInk = value;
    },
  }),
  textDecorationThickness: defineNodeProperty<"textDecorationThickness">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textDecorationThickness = value;
    },
  }),
  textTransform: defineNodeProperty<"textTransform">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).textTransform = value;
    },
  }),
  fontStyleItalic: defineNodeProperty<"fontStyleItalic">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontStyleItalic = value;
    },
  }),
  fontPostscriptName: defineNodeProperty<"fontPostscriptName">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontPostscriptName = value;
    },
  }),
  fontWeight: defineNodeProperty<"fontWeight">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontWeight = value;
    },
  }),
  fontKerning: defineNodeProperty<"fontKerning">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontKerning = value;
    },
  }),
  fontWidth: defineNodeProperty<"fontWidth">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontWidth = value;
    },
  }),
  fontFeatures: defineNodeProperty<"fontFeatures">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontFeatures = value;
    },
  }),
  fontVariations: defineNodeProperty<"fontVariations">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontVariations = value;
    },
  }),
  fontOpticalSizing: defineNodeProperty<"fontOpticalSizing">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontOpticalSizing = value;
    },
  }),
  fontSize: defineNodeProperty<"fontSize">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).fontSize = ranged(1, value);
    },
  }),
  lineHeight: defineNodeProperty<"lineHeight">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).lineHeight = ranged(0, value);
    },
  }),
  letterSpacing: defineNodeProperty<"letterSpacing">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).letterSpacing = value;
    },
  }),
  wordSpacing: defineNodeProperty<"wordSpacing">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).wordSpacing = value;
    },
  }),
  maxLength: defineNodeProperty<"maxLength">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).maxLength = value;
    },
  }),
  maxLines: defineNodeProperty<"maxLines">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).maxLines = value ? ranged(1, value) : null;
    },
  }),
  text: defineNodeProperty<"text">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      (draft as UN).text = value ?? null;
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
      (draft as UN).userdata = value;
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
        const { type: _, node_id: __, ...values } = action as NodeChangeAction;

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
