"use client";

import React, { memo, useMemo, useContext } from "react";
import type { FormAgentState } from "./state";
import {
  DispatchContext,
  useDispatch,
  type Dispatcher,
  type FlatDispatcher,
} from "./dispatch";

const Context = React.createContext<FormAgentState | undefined>(undefined);

export const StateProvider = memo(function StateProvider({
  state,
  dispatch,
  children,
}: {
  state: FormAgentState;
  dispatch?: Dispatcher;
  children?: React.ReactNode;
}) {
  return (
    <Context.Provider value={state}>
      <DispatchContext.Provider value={dispatch ?? __noop}>
        {children}
      </DispatchContext.Provider>
    </Context.Provider>
  );
});

const __noop = () => {};

export const useFormAgentState = (): [FormAgentState, FlatDispatcher] => {
  const state = useContext(Context);

  if (!state) {
    throw new Error(`No StateProvider: this is a logical error.`);
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch], [state, dispatch]);
};
