"use client";

import React from "react";
import type { BlocksEditorState, FormBlock } from "./state";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";
import { PlusIcon } from "@radix-ui/react-icons";
import { DndContext } from "@dnd-kit/core";

export default function BlocksEditorRoot({
  initial,
}: {
  initial: BlocksEditorState;
}) {
  const [state, dispatch] = React.useReducer(reducer, initial);

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <DndContext>
        <BlocksEditor />
      </DndContext>
    </StateProvider>
  );
}

function BlocksEditor() {
  const [state] = useEditorState();
  return (
    <div>
      <button className="rounded border p-2">
        <PlusIcon />
      </button>
      {state.blocks.map((block, index) => {
        return (
          <div key={index}>
            <Block {...block} />
          </div>
        );
      })}
    </div>
  );
}

function Block(props: FormBlock) {
  return (
    <div>
      <div>{props.type}</div>
      <div>{JSON.stringify(props.data)}</div>
    </div>
  );
}
