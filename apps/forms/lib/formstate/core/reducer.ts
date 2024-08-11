import { produce } from "immer";
import type { FormAgentAction } from "./action";
import type { FormAgentState } from "./state";

export function reducer(
  state: FormAgentState,
  action: FormAgentAction
): FormAgentState {
  switch (action.type) {
    case "section/change": {
      const { id } = action;
      return produce(state, (draft) => {
        draft.current_section_id = id;
      });
    }
    case "fields/value/change": {
      const { id, value } = action;
      return produce(state, (draft) => {
        draft.fields[id].value = value;
      });
    }
    case "section/prev": {
      return produce(state, (draft) => {
        const currindex = state.sections.findIndex(
          (section) => section.id === state.current_section_id
        );
        const previndex = currindex - 1;
        draft.current_section_id = state.sections[previndex].id;
      });
    }
    case "section/next": {
      return produce(state, (draft) => {
        const currindex = state.sections.findIndex(
          (section) => section.id === state.current_section_id
        );
        const nextindex = currindex + 1;
        draft.current_section_id = state.sections[nextindex].id;
      });
    }
    case "form/submit": {
      return produce(state, (draft) => {
        draft.is_submitting = true;
      });
    }
    default: {
      return produce(state, (draft) => {});
    }
  }
}
