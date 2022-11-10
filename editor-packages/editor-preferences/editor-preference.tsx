import React, { useReducer } from "react";
import styled from "@emotion/styled";
import { EditorPreferenceTree } from "./editor-preference-tree";
import routes from "./k/routes";
import type { Action, Dispatcher, PreferenceState } from "./core";
import { reducer } from "./reducers";
import { Router } from "./router";
import { Dialog } from "@mui/material";
import { EditorPreferenceBreadcrumb } from "./editor-preference-breadcrumb";

const Context = React.createContext<PreferenceState>(null);

const DispatchContext = React.createContext<Dispatcher>(null);

const __noop = () => {};

export function usePreferences() {
  return React.useContext(Context);
}

export const useDispatch = (): ((action: Action) => void) => {
  const dispatch = React.useContext(DispatchContext);
  return React.useCallback(
    (action: Action) => {
      dispatch(action);
    },
    [dispatch]
  );
};

export function EditorPreference({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useReducer(reducer, {
    open: false,
    route: "general",
    routes: routes,
  });

  const onClose = () => {
    dispatch({ type: "close" });
  };

  return (
    <Context.Provider value={state}>
      <DispatchContext.Provider value={dispatch ?? __noop}>
        <Dialog open={state.open} maxWidth="lg" onClose={onClose}>
          <Preferences />
        </Dialog>
        {children}
      </DispatchContext.Provider>
    </Context.Provider>
  );
}

function Preferences() {
  const state = usePreferences();
  const { route } = state;

  const dispatch = useDispatch();

  const onRouteChange = (route: string) => {
    dispatch({ type: "route", route });
  };

  if (!state) {
    return <></>;
  }
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
        <ContentHeader>
          <EditorPreferenceBreadcrumb
            route={route}
            onRoute={onRouteChange}
            base="Preferences"
            textTransform={"capitalize"}
          />
        </ContentHeader>
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

const ContentHeader = styled.header`
  display: flex;
  flex-direction: row;
  align-items: center;
  align-self: stretch;
  padding: 16px;
`;
