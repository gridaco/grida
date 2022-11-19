import produce from "immer";
import type {
  Action,
  FilterAction,
  NewFolderAction,
  NewSectionAction,
} from "./action";
import type { DashboardState } from "./state";

export function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "hierarchy/new-section": {
      const { name } = <NewSectionAction>action;
      return produce(state, (draft) => {
        draft.hierarchy.sections.push({
          name: name,
          items: [],
        });
      });
    }

    case "filter": {
      const { query } = <FilterAction>action;
      return produce(state, (draft) => {
        draft.filter.query = query;
        // TODO:
        // draft.hierarchy
      });
    }

    case "hierarchy/new-directory": {
      const { path } = <NewFolderAction>action;
      return produce(state, (draft) => {
        // not tested
        const parts = path.split("/");
        const name = parts.pop();
        const parent = parts.join("/");
        const section = draft.hierarchy.sections.find((s) => s.name === parent);
        if (section) {
          section.items.push({
            type: "folder",
            id: path, // other than path ?
            path: path,
            name: name,
            contents: [],
          });
        }
      });
    }
  }

  throw new Error(
    `[dashboard/reducer] - unknown action type "${action["type"]}"`
  );
}
