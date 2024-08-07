"use client";

import React, { memo, useMemo, useContext } from "react";
import type { FormEditorState } from "./state";
import {
  DispatchContext,
  useDispatch,
  type Dispatcher,
  type FlatDispatcher,
} from "./dispatch";

const Context = React.createContext<FormEditorState | undefined>(undefined);

export const StateProvider = memo(function StateProvider({
  state,
  dispatch,
  children,
}: {
  state: FormEditorState;
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

export const useEditorState = (): [FormEditorState, FlatDispatcher] => {
  const state = useContext(Context);

  if (!state) {
    throw new Error(`No StateProvider: this is a logical error.`);
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch], [state, dispatch]);
};
