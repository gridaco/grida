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
