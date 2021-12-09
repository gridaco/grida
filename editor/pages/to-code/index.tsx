import React, { useEffect, useState, useCallback, useReducer } from "react";
import { useRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor } from "scaffolds/editor";
import {
  createPendingWorkspaceState,
  EditorSnapshot,
  StateProvider,
  WorkspaceState,
} from "core/states";
import { WorkspaceAction } from "core/actions";
import { createInitialWorkspaceState } from "core/states";
import { workspaceReducer } from "core/reducers";
import { useDesign } from "hooks";
import {
  get_enable_components_config_from_query,
  get_framework_config_from_query,
  get_preview_runner_framework,
} from "query/to-code-options-from-query";
import { PendingState } from "core/utility-types";
import { DesignInput } from "@designto/config/input";

const pending_workspace_state = createPendingWorkspaceState();
//
type InitializationAction =
  | { type: "set"; value: EditorSnapshot }
  | { type: "update"; value: WorkspaceAction };

function reducer(
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

export default function Page() {
  const router = useRouter();

  // region global state
  const [state, dispatch] = useReducer(reducer, { type: "pending" });

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    dispatch({ type: "update", value: action });
  }, []);
  // endregion global state

  const design = useDesign({ type: "use-router", router: router });

  useEffect(() => {
    if (state.type === "success") return;

    if (design) {
      // TODO: set preferences to workspace state.
      const framework_config = get_framework_config_from_query(router.query);
      const isDebug = router.query.debug;
      const preview_runner_framework = get_preview_runner_framework(
        router.query
      );
      const enable_components = get_enable_components_config_from_query(
        router.query
      );
      dispatch({
        type: "set",
        value: {
          selectedNodes: [design.node],
          selectedPage: null, // TODO:
          design: {
            pages: [], // TODO:
            key: design.file,
            current: DesignInput.fromApiResponse({
              ...design,
              entry: design.reflect,
            }),
          },
        },
      });
    }
  }, [design, router]);

  const safe_value =
    state.type === "success" ? state.value : pending_workspace_state;

  return (
    <SigninToContinueBannerPrmoptProvider>
      <StateProvider state={safe_value} dispatch={handleDispatch}>
        <Editor />
      </StateProvider>
    </SigninToContinueBannerPrmoptProvider>
  );
}
