import { produce, type Draft } from "immer";
import grida from "@grida/schema";
import type { NodeChangeAction } from "../action";
import type cg from "@grida/cg";
import { v4 } from "uuid";
import assert from "assert";

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
  maxLength: defineNodeProperty<"maxLength">({
    assert: (node) => node.type === "text",
    apply: (draft, value, prev) => {
      draft.maxLength = value;
    },
  }),
};

function applyNodeProperty<K extends keyof grida.program.nodes.UnknwonNode>(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: K,
  value: any
) {
  "use strict";
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
      case "node/change/userdata": {
        const { userdata } = action;
        // double check if the userdata is serializable and k:v structure
        assert(
          userdata === undefined ||
            userdata === null ||
            (typeof userdata === "object" && !Array.isArray(userdata)),
          "userdata must be an k:v object"
        );
        draft.userdata = userdata;
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
      // keep
      case "node/change/size": {
        const { axis, value: length } = action;
        // TODO: check the sizing model (fixed or css)
        (draft as grida.program.nodes.i.ICSSDimension)[axis] = length;
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
      case "node/change/rotation": {
        const node = draft as Draft<grida.program.nodes.i.ICSSStylable>;
        node.rotation = action.rotation;
        break;
      }
      // keep
      case "node/change/cornerRadius": {
        assert(
          draft.type === "rectangle" ||
            draft.type === "image" ||
            draft.type === "video" ||
            draft.type === "container" ||
            draft.type === "component",
          "node type does not support cornerRadius"
        );

        // TODO: make [cornerRadius < (Math.min(width, height) / 2)]

        const each =
          typeof action.cornerRadius == "number"
            ? {
                tl: Math.max(action.cornerRadius, 0),
                tr: Math.max(action.cornerRadius, 0),
                br: Math.max(action.cornerRadius, 0),
                bl: Math.max(action.cornerRadius, 0),
              }
            : {
                tl: Math.max(action.cornerRadius[0], 0),
                tr: Math.max(action.cornerRadius[1], 0),
                br: Math.max(action.cornerRadius[2], 0),
                bl: Math.max(action.cornerRadius[3], 0),
              };
        if (each.tl === each.tr && each.tl === each.br && each.tl === each.bl) {
          draft.cornerRadius = each.tl;
        } else {
          draft.cornerRadius = [each.tl, each.tr, each.br, each.bl];
        }
        break;
      }
      case "node/change/fill": {
        assert(
          draft.type === "vector" ||
            draft.type === "path" ||
            draft.type === "image" ||
            draft.type === "rectangle" ||
            draft.type === "ellipse" ||
            draft.type === "text" ||
            draft.type === "richtext" ||
            draft.type === "container" ||
            draft.type === "component"
        );

        if (action.fill === null) {
          draft.fill = undefined;
          break;
        }

        switch (action.fill.type) {
          case "linear_gradient":
          case "radial_gradient":
            draft.fill = {
              ...(action.fill as
                | cg.LinearGradientPaint
                | cg.RadialGradientPaint),
              id: `gradient-${v4()}`,
            };
            break;
          case "solid":
            draft.fill = action.fill as
              | grida.program.nodes.i.props.SolidPaintToken
              | cg.SolidPaint;
            break;
        }
        break;
      }
      case "node/change/border": {
        assert(
          // draft.type === "text" ||
          draft.type === "image" ||
            draft.type === "video" ||
            draft.type === "container" ||
            draft.type === "component"
        );
        draft.border = action.border;
        break;
      }
      case "node/change/stroke":
      case "node/change/stroke-width":
      case "node/change/stroke-cap": {
        assert(
          draft.type === "path" ||
            draft.type === "line" ||
            draft.type === "rectangle" ||
            draft.type === "ellipse"
        );
        switch (action.type) {
          case "node/change/stroke": {
            if (action.stroke === null) {
              draft.stroke = undefined;
              break;
            }

            switch (action.stroke.type) {
              case "linear_gradient":
              case "radial_gradient":
                draft.stroke = {
                  ...(action.stroke as
                    | cg.LinearGradientPaint
                    | cg.RadialGradientPaint),
                  id: `gradient-${v4()}`,
                };
                break;
              case "solid":
                // FIXME:
                // @ts-expect-error
                draft.stroke = action.stroke as
                  | grida.program.nodes.i.props.SolidPaintToken
                  | cg.SolidPaint;
                break;
            }
            break;
          }
          case "node/change/stroke-width": {
            draft.strokeWidth = ranged(0, action.strokeWidth);
            break;
          }
          case "node/change/stroke-cap": {
            draft.strokeCap = action.strokeCap;
            break;
          }
        }
        break;
      }
      case "node/change/padding": {
        assert(draft.type === "container" || draft.type === "component");
        draft.padding = action.padding;
        break;
      }
      case "node/change/box-shadow": {
        assert(draft.type === "container" || draft.type === "component");
        draft.boxShadow = action.boxShadow;
        break;
      }
      case "node/change/layout": {
        assert(draft.type === "container" || draft.type === "component");
        assert(action.layout, "layout is required");
        draft.layout = action.layout;
        if (action.layout === "flex") {
          // initialize flex layout
          // each property cannot be undefined, but for older version compatibility, we need to set default value (only when not set)
          if (!draft.direction) draft.direction = "horizontal";
          if (!draft.mainAxisAlignment) draft.mainAxisAlignment = "start";
          if (!draft.crossAxisAlignment) draft.crossAxisAlignment = "start";
          if (!draft.mainAxisGap) draft.mainAxisGap = 0;
          if (!draft.crossAxisGap) draft.crossAxisGap = 0;
        }
        break;
      }
      case "node/change/direction": {
        assert(draft.type === "container" || draft.type === "component");
        assert(action.direction, "direction is required");
        draft.direction = action.direction;
        break;
      }
      case "node/change/mainAxisAlignment": {
        assert(draft.type === "container" || draft.type === "component");
        assert(action.mainAxisAlignment, "mainAxisAlignment is required");
        draft.mainAxisAlignment = action.mainAxisAlignment;
        break;
      }
      case "node/change/crossAxisAlignment": {
        assert(draft.type === "container" || draft.type === "component");
        assert(action.crossAxisAlignment, "crossAxisAlignment is required");
        draft.crossAxisAlignment = action.crossAxisAlignment;
        break;
      }
      case "node/change/gap": {
        assert(draft.type === "container" || draft.type === "component");
        assert(
          typeof action.gap === "number" ||
            typeof action.gap.mainAxisGap === "number",
          "invalid gap value"
        );
        if (typeof action.gap === "number") {
          draft.mainAxisGap = action.gap;
          draft.crossAxisGap = action.gap;
        } else {
          draft.mainAxisGap = action.gap.mainAxisGap;
          draft.crossAxisGap = action.gap.crossAxisGap;
        }
        break;
      }
      case "node/change/mainAxisGap": {
        assert(draft.type === "container" || draft.type === "component");
        assert(typeof action.mainAxisGap === "number", "invalid gap value");
        draft.mainAxisGap = action.mainAxisGap;
        break;
      }
      case "node/change/crossAxisGap": {
        assert(draft.type === "container" || draft.type === "component");
        assert(typeof action.crossAxisGap === "number", "invalid gap value");
        draft.crossAxisGap = action.crossAxisGap;
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
      case "node/change/text": {
        assert(draft.type === "text");
        draft.text = action.text ?? null;
        break;
      }
      case "node/change/fontFamily": {
        assert(draft.type === "text");
        draft.fontFamily = action.fontFamily;
        break;
      }
      case "node/change/fontSize": {
        assert(draft.type === "text");
        draft.fontSize = ranged(0, action.fontSize);
        break;
      }
      case "node/change/fontWeight": {
        assert(draft.type === "text");
        draft.fontWeight = action.fontWeight;
        break;
      }
      case "node/change/letterSpacing": {
        assert(draft.type === "text");
        switch (action.letterSpacing.type) {
          case "set":
            draft.letterSpacing = action.letterSpacing.value;
            break;
          case "delta":
            if (draft.letterSpacing !== undefined) {
              draft.letterSpacing += action.letterSpacing.value;
            }
            break;
        }
        break;
      }
      case "node/change/lineHeight": {
        assert(draft.type === "text");
        draft.lineHeight = action.lineHeight;
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
