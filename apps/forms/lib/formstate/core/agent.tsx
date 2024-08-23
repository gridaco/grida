import React from "react";
import { FormAgentState, initdummy } from "./state";
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

/**
 * TODO: this is added while developing a v_value feature on form field. once the value computation is moved to the higher level, this can be removed.
 * @returns
 */
export function DummyFormAgentStateProvider({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <FormAgentProvider initial={initdummy()}>{children}</FormAgentProvider>
  );
}
