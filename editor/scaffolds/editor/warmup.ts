import {
  createPendingWorkspaceState,
  EditorSnapshot,
  WorkspaceState,
} from "core/states";
import { createInitialWorkspaceState } from "core/states";
import { workspaceReducer } from "core/reducers";
import { PendingState } from "core/utility-types";
import { DesignInput } from "@designto/config/input";
import { TargetNodeConfig } from "query/target-node";
import { WorkspaceAction } from "core/actions";

const pending_workspace_state = createPendingWorkspaceState();
//
export type InitializationAction =
  | { type: "set"; value: EditorSnapshot }
  | { type: "update"; value: WorkspaceAction };

export function initialReducer(
  state: PendingState<WorkspaceState>,
  action: InitializationAction
): PendingState<WorkspaceState> {
  switch (action.type) {
    case "set":
      return {
        type: "success",
        value: createInitialWorkspaceState(action.value),
      };
    case "update":
      if (state.type === "success") {
        return {
          type: "success",
          value: workspaceReducer(state.value, action.value),
        };
      } else {
        return state;
      }
  }
}

export function initializeDesign(design: TargetNodeConfig): EditorSnapshot {
  return {
    selectedNodes: [design.node],
    selectedLayersOnPreview: [],
    selectedPage: null,
    design: {
      pages: [],
      key: design.file,
      input: DesignInput.fromApiResponse({
        ...design,
        entry: design.reflect,
      }),
    },
  };
}

export function safestate(initialState) {
  return initialState.type === "success"
    ? initialState.value
    : pending_workspace_state;
}

export const selectedPage = (
  prevstate,
  pages: { id: string }[],
  selectedNodes: string[]
) => {
  if (prevstate && prevstate.selectedPage) {
    return prevstate.selectedPage;
  }

  if (selectedNodes && pages) {
    return selectedNodes.length > 0
      ? pages.find((page) => {
          return isChildrenOf(selectedNodes[0], page);
        })?.id ?? null
      : // find page of current selection.
        null;
  }

  return pages?.[0].id ?? null; // otherwise, return first page.
};

type Tree = {
  readonly id: string;
  readonly children?: ReadonlyArray<Tree>;
};

function isChildrenOf(child: string, parent: Tree) {
  if (!parent) return false;
  if (child === parent.id) return true;
  if (parent.children?.length === 0) return false;
  return parent.children?.some((c) => isChildrenOf(child, c)) ?? false;
}
