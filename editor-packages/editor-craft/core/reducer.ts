import produce from "immer";
import { CraftHistoryAction, CraftDraftAction } from "./action";
import { EditorState } from "editor/core/states";
import { CraftHtmlElement } from "./state";

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
      const selected = state.selectedNodes[0];
      const target = id || selected;
      return produce(state, (draft) => {
        draft.craft.children = draft.craft.children.filter(
          (c) => c.id !== target
        );
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
    case "(craft)/widget/text/new": {
      //
      break;
    }
    case "(craft)/widget/new": {
      switch (action.widget) {
        case "container": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id: new Date().getTime().toString(),
              name: "container",
              x: 0,
              y: 0,
              tag: "div",
              attributes: {
                class: [],
              },
              style: {
                width: 100,
                height: 100,
                backgroundColor: "black",
              },
              children: [],
              width: 100,
              height: 100,
              absoluteX: 0,
              absoluteY: 0,
              rotation: 0,
            });
          });
        }
        case "textfield": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id: new Date().getTime().toString(),
              name: "input",
              x: 0,
              y: 0,
              tag: "input",
              attributes: {
                type: "text",
                placeholder: "Enter your text",
                class: [],
              },
              style: {},
              children: [],
              width: 100,
              height: 100,
              absoluteX: 0,
              absoluteY: 0,
              rotation: 0,
            });
          });
        }
        case "icon": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "@radix-ui/react-icons",
              id: new Date().getTime().toString(),
              name: "PlusIcon",
              style: {
                width: 15,
                height: 15,
                color: "black",
              },
              children: [],
              width: 15,
              height: 15,
              absoluteX: 0,
              absoluteY: 0,
              rotation: 0,
            });
          });
        }
        case "text": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id: new Date().getTime().toString(),
              name: "text",
              x: 0,
              y: 0,
              tag: "span",
              attributes: {
                class: [],
              },
              style: {
                width: 100,
                height: 100,
                color: "black",
              },
              text: "Hello, World!",
              children: [],
              width: 100,
              height: 100,
              absoluteX: 0,
              absoluteY: 0,
              rotation: 0,
            });
          });
        }
        case "image": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id: new Date().getTime().toString(),
              name: "image",
              x: 0,
              y: 0,
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
              width: 100,
              height: 100,
              absoluteX: 0,
              absoluteY: 0,
              rotation: 0,
            });
          });
        }
        case "image-circle": {
          return produce(state, (draft) => {
            draft.craft.children.push(<CraftHtmlElement<"img">>{
              type: "html",
              id: new Date().getTime().toString(),
              name: "circle image",
              x: 0,
              y: 0,
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
              width: 100,
              height: 100,
              absoluteX: 0,
              absoluteY: 0,
              rotation: 0,
            });
          });
        }
        case "video": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id: new Date().getTime().toString(),
              name: "video",
              x: 0,
              y: 0,
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
              width: 100,
              height: 100,
              absoluteX: 0,
              absoluteY: 0,
              rotation: 0,
            });
          });
        }
        case "button": {
          return produce(state, (draft) => {
            draft.craft.children.push({
              type: "html",
              id: new Date().getTime().toString(),
              name: "button",
              x: 0,
              y: 0,
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
              width: 100,
              height: 100,
              absoluteX: 0,
              absoluteY: 0,
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
