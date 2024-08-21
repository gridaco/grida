"use client";

import React, { memo } from "react";
import type { FormEditorState } from "./state";
import { DispatchContext, type Dispatcher } from "./dispatch";

export const Context = React.createContext<FormEditorState | undefined>(
  undefined
);

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
