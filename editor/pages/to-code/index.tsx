import React, { useEffect, useCallback, useReducer } from "react";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor } from "scaffolds/editor";
import { EditorSnapshot, StateProvider, WorkspaceState } from "core/states";
import { WorkspaceAction } from "core/actions";
import { createInitialWorkspaceState } from "core/states";
import { workspaceReducer } from "core/reducers";

type InitializationAction =
  | { type: "set"; value: EditorSnapshot }
  | { type: "update"; value: WorkspaceAction };

function reducer(
  state: WorkspaceState,
  action: InitializationAction
): WorkspaceState {
  switch (action.type) {
    case "set":
      return createInitialWorkspaceState(action.value);
    case "update":
      if (state) {
        return workspaceReducer(state, action.value);
      } else {
        return;
      }
  }
}

export default function Page() {
  const [state, dispatch] = useReducer(reducer, undefined);

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    dispatch({ type: "update", value: action });
  }, []);

  return (
    <SigninToContinueBannerPrmoptProvider>
      <StateProvider state={state} dispatch={handleDispatch}>
        <Editor />
      </StateProvider>
    </SigninToContinueBannerPrmoptProvider>
  );
}
