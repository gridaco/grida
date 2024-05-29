import React from "react";
import { FormAgentState, init } from "./state";
import { reducer } from "./reducer";
import { StateProvider } from "./provider";

export function FormAgentProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormAgentState }>) {
  const [state, dispatch] = React.useReducer(reducer, initial);

  return (
    <StateProvider state={state} dispatch={dispatch}>
      {children}
    </StateProvider>
  );
}
