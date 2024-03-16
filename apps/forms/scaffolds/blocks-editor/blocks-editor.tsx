"use client";

import React, { useCallback, useId } from "react";
import type { FormEditorState, FormBlock } from "../editor/state";
import { FormEditorProvider, useEditorState } from "../editor";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Block, BlocksCanvas } from "./blocks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FieldEditPanel } from "../panels/field-edit-panel";

export default function BlocksEditorRoot() {
  return (
    <DndContextProvider>
      <BlocksEditor />
    </DndContextProvider>
  );
}

function DndContextProvider({ children }: React.PropsWithChildren<{}>) {
  const [, dispatch] = useEditorState();

  const id = useId();

  const sensors = useSensors(useSensor(PointerSensor));

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      {children}
    </DndContext>
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (active.type === "section" && over?.type === "section") {
      event.over = null; // Prevent section over section
    }

    if (over && active.id !== over.id) {
      dispatch({
        type: "blocks/sort",
        block_id: active.id,
        over_id: over.id,
      });
    }
  }
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
      <FieldEditPanel
        open={state.is_field_edit_panel_open}
        onOpenChange={(open) => {
          dispatch({ type: "editor/field/edit", open });
        }}
      />
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
      <BlocksCanvas className="flex flex-col gap-4 mt-10">
        <SortableContext
          items={state.blocks.map((block) => block.id)}
          strategy={verticalListSortingStrategy}
        >
          {state.blocks.map((block, index) => {
            return (
              <div key={index}>
                <Block {...block} />
              </div>
            );
          })}
        </SortableContext>
      </BlocksCanvas>
    </div>
  );
}
