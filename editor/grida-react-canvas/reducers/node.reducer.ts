import { produce, type Draft } from "immer";
import grida from "@grida/schema";
import type { NodeChangeAction } from "../../grida-canvas/action";
import type cg from "@grida/cg";
import { v4 } from "uuid";
import assert from "assert";

export default function nodeReducer<
  N extends Partial<grida.program.nodes.Node>,
>(node: N, action: NodeChangeAction): N {
  return produce(node, (draft) => {
    switch (action.type) {
      case "node/change/active": {
        draft.active = action.active;
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
      case "node/change/locked": {
        draft.locked = action.locked;
        break;
      }
      case "node/change/name": {
        (draft as grida.program.nodes.i.IBaseNode).name =
          action.name || (node.type as string);
        break;
      }
      case "node/change/positioning": {
        const { positioning } = action;
        const pos = draft as grida.program.nodes.i.IPositioning;
        if ("position" in positioning) {
          if (positioning.position) {
            pos.position = positioning.position;
          }
        }
        if ("left" in positioning) pos.left = positioning.left;
        if ("top" in positioning) pos.top = positioning.top;
        if ("right" in positioning) pos.right = positioning.right;
        if ("bottom" in positioning) pos.bottom = positioning.bottom;
        break;
      }
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
      case "node/change/size": {
        const { axis, value: length } = action;
        // TODO: check the sizing model (fixed or css)
        (draft as grida.program.nodes.i.ICSSDimension)[axis] = length;
        break;
      }
      case "node/change/href": {
        (draft as grida.program.nodes.i.IHrefable).href = action.href;
        break;
      }
      case "node/change/target": {
        (draft as grida.program.nodes.i.IHrefable).target = action.target;
        break;
      }
      case "node/change/mouse-cursor": {
        (draft as grida.program.nodes.i.IMouseCursor).cursor = action.cursor;
        break;
      }
      case "node/change/component": {
        assert(draft.type === "instance");
        draft.component_id = action.component_id;
        break;
      }
      case "node/change/src": {
        assert(draft.type === "image");
        draft.src = action.src;
        break;
      }
      case "node/change/props": {
        assert(draft.type === "instance" || draft.type === "template_instance");
        draft.props = Object.assign({}, draft.props, action.props);
        break;
      }
      case "node/change/opacity": {
        const node = draft as Draft<grida.program.nodes.i.ICSSStylable>;
        switch (action.opacity.type) {
          case "set":
            node.opacity = ranged(0, action.opacity.value, 1);
            break;
          case "delta":
            node.opacity = ranged(0, node.opacity + action.opacity.value, 1);
            break;
        }
        break;
      }
      case "node/change/rotation": {
        const node = draft as Draft<grida.program.nodes.i.ICSSStylable>;
        switch (action.rotation.type) {
          case "set":
            node.rotation = action.rotation.value;
            break;
          case "delta":
            node.rotation += action.rotation.value;
            break;
        }
        break;
      }
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
            switch (action.strokeWidth.type) {
              case "set":
                draft.strokeWidth = ranged(0, action.strokeWidth.value);
                break;
              case "delta":
                if (draft.strokeWidth !== undefined) {
                  draft.strokeWidth = ranged(
                    0,
                    draft.strokeWidth + action.strokeWidth.value
                  );
                }

                break;
            }
            break;
          }
          case "node/change/stroke-cap": {
            draft.strokeCap = action.strokeCap;
            break;
          }
        }
        break;
      }
      case "node/change/fit": {
        assert(draft.type === "image");
        draft.fit = action.fit;
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
        switch (action.fontSize.type) {
          case "set":
            draft.fontSize = ranged(0, action.fontSize.value);
            break;
          case "delta":
            if (draft.fontSize !== undefined) {
              draft.fontSize = ranged(
                0,
                draft.fontSize + action.fontSize.value
              );
            }
            break;
        }
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
        switch (action.lineHeight.type) {
          case "set":
            draft.lineHeight = action.lineHeight.value;
            break;
          case "delta":
            if (draft.lineHeight !== undefined) {
              draft.lineHeight += action.lineHeight.value;
            }
            break;
        }
        break;
      }
      case "node/change/textAlign": {
        assert(draft.type === "text");
        draft.textAlign = action.textAlign;
        break;
      }
      case "node/change/textAlignVertical": {
        assert(draft.type === "text");
        draft.textAlignVertical = action.textAlignVertical;
        break;
      }
      case "node/change/maxlength": {
        assert(draft.type === "text");
        draft.maxLength = action.maxlength;
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
