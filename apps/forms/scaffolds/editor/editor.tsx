import React from "react";
import { StateProvider } from "./provider";
import { reducer } from "./reducer";
import { FormEditorState } from "./state";

export function FormEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormEditorState }>) {
  const [state, dispatch] = React.useReducer(reducer, initial);
  return (
    <StateProvider state={state} dispatch={dispatch}>
      {children}
    </StateProvider>
  );
}
