"use client";

import React, { memo } from "react";
import type { EditorState } from "./state";
import { DispatchContext, type Dispatcher } from "./dispatch";

export const Context = React.createContext<EditorState | undefined>(undefined);

export const StateProvider = memo(function StateProvider({
  state,
  dispatch,
  children,
}: {
  state: EditorState;
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
