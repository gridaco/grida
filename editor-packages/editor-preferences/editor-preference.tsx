import React, { useReducer } from "react";
import styled from "@emotion/styled";
import { EditorPreferenceTree } from "./editor-preference-tree";
import routes from "./routes";
import type { Dispatcher, PreferenceState } from "./core";
import { reducer } from "./reducers";
import { Router } from "./router";

const Context = React.createContext<PreferenceState>(null);

const DispatchContext = React.createContext<Dispatcher>(null);

const __noop = () => {};

export function usePreferences() {
  return React.useContext(Context);
}

export function useDispatch() {
  return React.useContext(DispatchContext);
}

export function EditorPreference() {
  const [state, dispatch] = useReducer(reducer, {
    route: "general",
    routes: routes,
  });

  return (
    <Context.Provider value={state}>
      <DispatchContext.Provider value={dispatch ?? __noop}>
        <Preferences />
      </DispatchContext.Provider>
    </Context.Provider>
  );
}

function Preferences() {
  return (
    <Page
      style={{
        width: "80vw",
        height: "80vh",
      }}
    >
      <Sidebar>
        <EditorPreferenceTree />
      </Sidebar>
      <Content>
        <Router />
      </Content>
    </Page>
  );
}

const Page = styled.div`
  display: flex;
  flex-direction: row;
  background: #1e1e1e;
`;

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  flex: 2;
  min-width: 200px;
  max-width: 300px;
  background: rgba(255, 255, 255, 0.1);
  overflow-y: scroll;
  overflow-x: hidden;
  padding: 8px;
  gap: 8px;
`;

const Content = styled.div`
  flex: 8;
`;
