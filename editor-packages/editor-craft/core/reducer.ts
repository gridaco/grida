import produce from "immer";
import { CraftAction } from "./action";
import { EditorState } from "editor/core/states";
import { CraftHtmlElement } from "./state";

export function craftReducer(
  state: EditorState,
  action: CraftAction
): EditorState {
  console.log("reducer", action);
  switch (action.type) {
    case "(craft)/widget/text/new": {
      //
      break;
    }
    case "(craft)/widget/new": {
      switch (action.widget) {
        case "container": {
          return produce(state, (draft) => {
            draft.craft.children.push({
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
        case "text": {
          return produce(state, (draft) => {
            draft.craft.children.push({
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
