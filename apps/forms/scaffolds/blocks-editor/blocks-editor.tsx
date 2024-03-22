"use client";

import React, { useCallback, useEffect, useId, useRef } from "react";
import { type EditorFormBlock, DRAFT_ID_START_WITH } from "../editor/state";
import { useEditorState } from "../editor";
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
import { createClientClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

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

function PendingBlocksResolver() {
  const [state, dispatch] = useEditorState();

  const supabase = createClientClient();

  const insertBlock = useCallback(
    async (block: EditorFormBlock) => {
      //
      const { data } = await supabase
        .from("form_block")
        .insert({
          data: {},
          form_id: state.form_id,
          type: block.type,
          local_index: block.local_index,
          form_field_id: block.form_field_id,
        })
        .select()
        .single();

      return data;
    },
    [state.form_id, supabase]
  );

  useEffect(() => {
    // check for pending blocks, via id == PENDING_ID (Symbol)
    // create them on db, and update their id
    const pending_blocks = state.blocks.filter((block) =>
      block.id.startsWith(DRAFT_ID_START_WITH)
    );

    for (const block of pending_blocks) {
      insertBlock(block).then((data) => {
        if (!data) {
          toast.error("Failed to create block");
          return;
        }

        dispatch({
          type: "blocks/resolve",
          block_id: block.id,
          block: data,
        });

        toast.success("Block created");
      });
    }
  }, [dispatch, insertBlock, state.blocks]);

  return <></>;
}

function useSyncBlocks(blocks: EditorFormBlock[]) {
  const supabase = createClientClient();
  const prevBlocksRef = useRef(blocks);

  useEffect(() => {
    const prevBlocks = prevBlocksRef.current;
    const updatedBlocks = blocks.filter((block) => {
      const prevBlock = prevBlocks.find((prev) => prev.id === block.id);
      return (
        !prevBlock ||
        block.type !== prevBlock.type ||
        block.local_index !== prevBlock.local_index ||
        block.form_field_id !== prevBlock.form_field_id
      );
    });

    updatedBlocks.forEach(async (block) => {
      try {
        const { data, error } = await supabase
          .from("form_block")
          .update({
            // Assuming these are the fields to update
            type: block.type,
            local_index: block.local_index,
            form_field_id: block.form_field_id,
          })
          .eq("id", block.id)
          .single();

        if (error) throw new Error(error.message);
        // Handle successful update (e.g., through a dispatch or local state update)
      } catch (error) {
        console.error("Failed to update block:", error);
        // Handle error (e.g., rollback changes, show error message)
      }
    });

    // Update the ref to the current blocks for the next render
    prevBlocksRef.current = blocks;
  }, [blocks, supabase]);
}

function OptimisticBlocksSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  // sync data to server, when blocks change. (use id as identifier)
  // look for differences in..
  // - type
  // - local_index
  // - form_field_id
  const [state] = useEditorState();

  // Use the custom hook to sync blocks
  useSyncBlocks(state.blocks);

  return <>{children}</>;
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
      <PendingBlocksResolver />
      <OptimisticBlocksSyncProvider />
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
          {state.blocks.map((block) => {
            return (
              <div key={block.id}>
                <Block {...block} />
              </div>
            );
          })}
        </SortableContext>
      </BlocksCanvas>
    </div>
  );
}
