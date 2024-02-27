import produce from "immer";
import { CraftHistoryAction, CraftDraftAction } from "./action";
import { EditorState } from "editor/core/states";
import { CraftHtmlElement, CraftRadixIconElement } from "./state";
import { math, XYWH } from "@code-editor/canvas";

export function craftDraftReducer(
  state: EditorState,
  action: CraftDraftAction
): EditorState {
  switch (action.type) {
    case "(draft)/(craft)/node/background-color": {
      const { color } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            console.log("draft color", color);
            const colorstr = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            (c as CraftHtmlElement).style.backgroundColor = colorstr;
          }
        });
      });
    }
    case "(draft)/(craft)/node/foreground-color": {
      const { color } = action;
      return produce(state, (draft) => {
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            console.log("draft color", color);
            const colorstr = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            (c as CraftHtmlElement).style.color = colorstr;
          }
        });
      });
    }
  }
}

export function craftHistoryReducer(
  state: EditorState,
  action: CraftHistoryAction
): EditorState {
  // console.log("reducer", action);
  switch (action.type) {
    case "(craft)/node/delete": {
      const { id } = action;
      const targets = id ? [id] : state.selectedNodes;
      return produce(state, (draft) => {
        draft.craft.children = draft.craft.children.filter(
          (c) => !targets.includes(c.id)
        );
      });
    }
    case "(craft)/node/opacity": {
      return produce(state, (draft) => {
        const { opacity } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            c.style.opacity = opacity;
          }
        });
      });
    }
    case "(craft)/node/text/data": {
      return produce(state, (draft) => {
        const { data } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            (c as CraftHtmlElement).text = data;
          }
        });
      });
    }
    case "(craft)/node/icon/data": {
      return produce(state, (draft) => {
        const { data } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            (c as CraftRadixIconElement).icon = data;
          }
        });
      });
    }
    case "(craft)/node/background-color": {
      return produce(state, (draft) => {
        const { color } = action;
        const selected = draft.selectedNodes[0];
        draft.craft.children.forEach((c) => {
          if (c.id === selected) {
            const colorstr = `rgba(${color.r},${color.g},${color.b},${color.a})`;
            (c as CraftHtmlElement).style.backgroundColor = colorstr;
          }
        });
      });
    }
    case "(craft)/widget/new": {
      const id = new Date().getTime().toString();
      const point = next_placement(state, [0, 0, 100, 100]);
      const [x, y, w, h] = point;
      switch (action.widget) {
        case "container": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id,
              name: "container",
              x: x,
              y: y,
              tag: "div",
              attributes: {
                class: [],
              },
              style: {
                width: w,
                height: h,
                backgroundColor: "grey",
              },
              children: [],
              width: w,
              height: h,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        case "textfield": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id,
              name: "input",
              x: x,
              y: y,
              tag: "input",
              attributes: {
                type: "text",
                placeholder: "Enter your text",
                class: [],
              },
              style: {},
              children: [],
              width: w,
              height: h,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        case "icon": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "@radix-ui/react-icons",
              id,
              name: "icon",
              x: x,
              y: y,
              icon: "PlusIcon",
              color: "black",
              children: [],
              width: 15,
              height: 15,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        case "text": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id,
              name: "text",
              x: x,
              y: y,
              tag: "span",
              attributes: {
                class: [],
              },
              style: {
                width: w,
                height: h,
                color: "black",
              },
              text: "Hello, World!",
              children: [],
              width: w,
              height: h,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        case "image": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id,
              name: "image",
              x,
              y,
              tag: "img",
              attributes: {
                class: [],
                src: "https://via.placeholder.com/150",
              },
              style: {
                width: 100,
                height: 100,
                backgroundColor: "black",
              },
              children: [],
              width: w,
              height: h,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        case "image-circle": {
          return produce(state, (draft) => {
            draft.craft.children.push(<CraftHtmlElement<"img">>{
              type: "html",
              id,
              name: "circle image",
              x: x,
              y: y,
              tag: "img",
              attributes: {
                src: "https://via.placeholder.com/150",
                style: {
                  width: 100,
                  height: 100,
                  borderRadius: 999,
                  overflow: "hidden",
                  backgroundColor: "black",
                },
                tw: [
                  "rounded-full",
                  "overflow-hidden",
                  "border-4",
                  "border-white",
                ].join(" "),
              },

              children: [],
              width: w,
              height: h,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        case "video": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id,
              name: "video",
              x: x,
              y: y,
              tag: "video",
              attributes: {
                src: "https://www.w3schools.com/html/mov_bbb.mp4",
              },
              style: {
                width: 100,
                height: 100,
                backgroundColor: "black",
              },
              children: [],
              width: w,
              height: h,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        case "button": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id,
              name: "button",
              x: x,
              y: y,
              tag: "button",
              attributes: {
                tw: [
                  "bg-blue-500",
                  "text-white",
                  "p-2",
                  "rounded",
                  "shadow-md",
                ].join(" "),
              },
              style: {
                width: 100,
                height: 100,
              },
              children: [],
              text: "Button",
              width: w,
              height: h,
              absoluteX: x,
              absoluteY: y,
              rotation: 0,
            });
          });
        }
        default: {
          throw new Error(`Not implemented widget type: ${action.widget}`);
        }
      }
      break;
      //
    }
  }

  return { ...state };
}

function next_placement(state: EditorState, item: XYWH) {
  return math.no_overlap_placement(
    item,
    state.craft.children.map((c) => [
      c.absoluteX,
      c.absoluteY,
      c.width,
      c.height,
    ]),
    {
      padding: 100,
    }
  );
}
