import produce from "immer";
import type {
  Action,
  FilterAction,
  FoldAction,
  FoldAllAction,
  NewFolderAction,
  NewSectionAction,
  UnfoldAction,
  UnfoldAllAction,
} from "./action";
import type { DashboardFolderItem, DashboardState } from "./state";

export function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "hierarchy/new-section": {
      const { name } = <NewSectionAction>action;
      return produce(state, (draft) => {
        draft.hierarchy.sections.push({
          $type: "folder",
          name: name,
          id: name, // add confliction check
          path: name, // add confliction check
          contents: [],
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
          section.contents.push({
            $type: "folder",
            id: path, // other than path ?
            path: path,
            name: name,
            contents: [],
          });
        }
      });
    }

    case "hierarchy/fold": {
      const { path } = <FoldAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings.push(path);
      });
    }

    case "hierarchy/unfold": {
      const { path } = <UnfoldAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings = draft.hierarchyFoldings.filter(
          (p) => p !== path
        );
      });
    }

    case "hierarchy/fold-all": {
      const {} = <FoldAllAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings = state.hierarchy.sections.map((s) => s.path);
      });
    }

    case "hierarchy/unfold-all": {
      const {} = <UnfoldAllAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings.length = 0;
      });
    }
  }

  throw new Error(
    `[dashboard/reducer] - unknown action type "${action["type"]}"`
  );
}
