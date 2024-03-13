"use client";

import React, { useCallback } from "react";
import type { BlocksEditorState, FormBlock } from "./state";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";
import { PlusIcon } from "@radix-ui/react-icons";
import { DndContext } from "@dnd-kit/core";
import { Block, BlocksCanvas } from "./blocks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";

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
  const [state, dispatch] = useEditorState();

  const addSectionBlock = useCallback(() => {
    dispatch({
      type: "blocks/new",
      block: "section",
    });
  }, [dispatch]);

  const addFieldBlock = useCallback(() => {
    dispatch({
      type: "blocks/new",
      block: "field",
    });
  }, [dispatch]);

  return (
    <div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className="rounded border p-2">
            <PlusIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent className="z-50">
            <DropdownMenuItem onClick={addSectionBlock}>
              Section
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addFieldBlock}>Field</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>

      <BlocksCanvas className="mt-10"></BlocksCanvas>
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
