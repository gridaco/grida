import React, { useEffect, useCallback, useReducer } from "react";
import { StateProvider } from "@core/app-state";
import {
  createInitialWorkspaceState,
  fetchApplicationSnapshot,
  WorkspaceAction,
  WorkspaceState,
  workspaceReducer,
  ApplicationSnapshot,
} from "@core/state";
import { RecoilRoot } from "recoil";
import { Scaffold } from "../app-scaffold/scaffold";
import { GlobalStyles } from "./global-style-override";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

type InitializationAction =
  | { type: "set"; value: ApplicationSnapshot }
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

export function AppRoot(props: {
  mode: "browser" | "desktop";
  controlDoubleClick: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, undefined);

  useEffect(() => {
    fetchApplicationSnapshot().then((d) => {
      dispatch({ type: "set", value: d });
    });
  }, []);

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    dispatch({ type: "update", value: action });
  }, []);

  if (!state) {
    return null;
  }

  return (
    <>
      <GlobalStyles />
      <RecoilRoot>
        <Router>
          <StateProvider state={state} dispatch={handleDispatch}>
            <Scaffold
              mode={props.mode}
              controlDoubleClick={props.controlDoubleClick}
            />
          </StateProvider>
        </Router>
      </RecoilRoot>
    </>
  );
}
