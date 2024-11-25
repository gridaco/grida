import { produce, type Draft } from "immer";
import { grida } from "@/grida";
import type { NodeChangeAction } from "../action";
import assert from "assert";
import { v4 } from "uuid";

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
        (draft as grida.program.nodes.i.IPositioning).left = positioning.left;
        (draft as grida.program.nodes.i.IPositioning).top = positioning.top;
        (draft as grida.program.nodes.i.IPositioning).right = positioning.right;
        (draft as grida.program.nodes.i.IPositioning).bottom =
          positioning.bottom;
        (draft as grida.program.nodes.i.IPositioning).position =
          positioning.position;
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
        const { axis, length } = action;
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
        (draft as Draft<grida.program.nodes.i.ICSSStylable>).opacity =
          action.opacity;
        break;
      }
      case "node/change/rotation": {
        (draft as Draft<grida.program.nodes.i.ICSSStylable>).rotation =
          action.rotation;
        break;
      }
      case "node/change/cornerRadius": {
        assert(
          draft.type === "rectangle" ||
            draft.type === "container" ||
            draft.type === "image",
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
                tl: Math.max(action.cornerRadius.topLeftRadius, 0),
                tr: Math.max(action.cornerRadius.topRightRadius, 0),
                br: Math.max(action.cornerRadius.bottomRightRadius, 0),
                bl: Math.max(action.cornerRadius.bottomLeftRadius, 0),
              };
        if (each.tl === each.tr && each.tl === each.br && each.tl === each.bl) {
          draft.cornerRadius = each.tl;
        } else {
          draft.cornerRadius = {
            topLeftRadius: each.tl,
            topRightRadius: each.tr,
            bottomRightRadius: each.br,
            bottomLeftRadius: each.bl,
          };
        }
        break;
      }
      case "node/change/fill": {
        assert(
          draft.type === "vector" ||
            draft.type === "rectangle" ||
            draft.type === "ellipse" ||
            draft.type === "text" ||
            draft.type === "container"
        );
        switch (action.fill.type) {
          case "linear_gradient":
            draft.fill = { ...action.fill, id: `gradient-${v4()}` };
            break;
          case "radial_gradient":
            draft.fill = { ...action.fill, id: `gradient-${v4()}` };
            break;
          case "solid":
            draft.fill = action.fill;
        }

        break;
      }
      case "node/change/border": {
        assert(
          // draft.type === "vector" ||
          // draft.type === "rectangle" ||
          // draft.type === "ellipse" ||
          // draft.type === "text" ||
          draft.type === "container"
        );
        draft.border = action.border;
        break;
      }
      case "node/change/fit": {
        assert(draft.type === "image");
        draft.fit = action.fit;
        break;
      }
      case "node/change/padding": {
        assert(draft.type === "container");
        draft.padding = action.padding;
        break;
      }
      case "node/change/layout": {
        assert(draft.type === "container");
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
        assert(draft.type === "container");
        assert(action.direction, "direction is required");
        draft.direction = action.direction;
        break;
      }
      case "node/change/mainAxisAlignment": {
        assert(draft.type === "container");
        assert(action.mainAxisAlignment, "mainAxisAlignment is required");
        draft.mainAxisAlignment = action.mainAxisAlignment;
        break;
      }
      case "node/change/crossAxisAlignment": {
        assert(draft.type === "container");
        assert(action.crossAxisAlignment, "crossAxisAlignment is required");
        draft.crossAxisAlignment = action.crossAxisAlignment;
        break;
      }
      case "node/change/gap": {
        assert(draft.type === "container");
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
        assert(draft.type === "container");
        assert(typeof action.mainAxisGap === "number", "invalid gap value");
        draft.mainAxisGap = action.mainAxisGap;
        break;
      }
      case "node/change/crossAxisGap": {
        assert(draft.type === "container");
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
        draft.fontSize = action.fontSize;
        break;
      }
      case "node/change/fontWeight": {
        assert(draft.type === "text");
        draft.fontWeight = action.fontWeight;
        break;
      }
      case "node/change/letterSpacing": {
        assert(draft.type === "text");
        draft.letterSpacing = action.letterSpacing;
        break;
      }
      case "node/change/lineHeight": {
        assert(draft.type === "text");
        draft.lineHeight = action.lineHeight;
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