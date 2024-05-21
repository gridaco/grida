import { produce } from "immer";
import type { FormAgentAction } from "./action";
import type { FormAgentState } from "./state";
export function reducer(
  state: FormAgentState,
  action: FormAgentAction
): FormAgentState {
  switch (action.type) {
    case "fields/value/change": {
      return produce(state, (draft) => {
        draft.fields[action.id].value = action.value;
      });
    }
    default: {
      return produce(state, (draft) => {});
    }
  }
}
