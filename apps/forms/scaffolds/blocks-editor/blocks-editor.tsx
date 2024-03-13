"use client";

import React from "react";
import type { BlocksEditorState } from "./state";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";

export default function BlocksEditorRoot({
  initial,
}: {
  initial: BlocksEditorState;
}) {
  const [state, dispatch] = React.useReducer(reducer, initial);

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <BlocksEditor />
    </StateProvider>
  );
}

function BlocksEditor() {
  const [state] = useEditorState();
  return <div>{state.blocks.length}</div>;
}
