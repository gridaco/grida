import { produce } from "immer";
import type { FormAgentAction } from "./action";
import type { FormAgentState, VirtualFileValueProxy } from "./state";

export function reducer(
  state: FormAgentState,
  action: FormAgentAction
): FormAgentState {
  switch (action.type) {
    case "fields/value/change": {
      const { id, value } = action;
      return produce(state, (draft) => {
        draft.fields[id].value = value;
      });
    }
    case "fields/files/change": {
      const { id, files } = action;
      return produce(state, (draft) => {
        const mapper = (file: File) =>
          ({
            // reading is required as the properties are proxied
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          }) satisfies VirtualFileValueProxy;

        draft.fields[id].files = files.map(mapper);
        if (files.length === 1) {
          draft.fields[id].file = mapper(files[0]);
        }
        draft.rawfiles[id] = files;
      });
    }
    case "fields/files/metadata/change": {
      const { id, index, metadata } = action;
      return produce(state, (draft) => {
        try {
          draft.fields[id].files![index].duration = metadata.duration;
          if (draft.fields[id].file)
            draft.fields[id].file.duration = metadata.duration;
        } catch (e) {
          console.error("metadata resolved, but file was removed", metadata);
        }
      });
    }
    case "section/change": {
      const { id } = action;
      return produce(state, (draft) => {
        draft.current_section_id = id;
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
