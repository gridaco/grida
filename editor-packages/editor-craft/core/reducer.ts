import produce from "immer";
import { CraftAction } from "./action";
import { EditorState } from "editor/core/states";

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
