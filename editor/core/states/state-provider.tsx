import React, { memo, ReactNode } from "react";
import { Dispatcher, DispatchContext } from "../dispatch";
import { StateContext } from "./workspace-context";
import { WorkspaceState } from "./workspace-state";

export const StateProvider = memo(function StateProvider({
  state,
  dispatch,
  children,
}: {
  state: WorkspaceState;
  dispatch?: Dispatcher;
  children?: ReactNode;
}) {
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch ?? __noop}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
});

const __noop = () => {};
