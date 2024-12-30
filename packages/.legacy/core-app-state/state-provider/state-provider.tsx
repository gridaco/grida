import React, { memo, ReactNode } from "react";
import { Dispatcher, DispatchContext } from "../dispatch";
import { noop } from "../_utils";
import { StateContext } from "../workspace-state";
import { WorkspaceState } from "@core/state";

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
      <DispatchContext.Provider value={dispatch ?? noop}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
});
