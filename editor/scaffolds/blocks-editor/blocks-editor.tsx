"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { type EditorFlatFormBlock, DRAFT_ID_START_WITH } from "../editor/state";
import { useEditorState } from "../editor";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Block, BlocksCanvas } from "./blocks";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createBrowserFormsClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  InsertCommandDialogTrigger,
  InsertCommandPopover,
} from "./insert-menu";
import { FormAgentProvider, initdummy } from "@/grida-forms/formstate";
import { cn } from "@/components/lib/utils";
import { PlusIcon } from "@radix-ui/react-icons";
import { PopoverTrigger } from "@radix-ui/react-popover";

export default function BlocksEditorRoot() {
  return (
    <DndContextProvider>
      <DummyFormAgentStateProvider>
        <BlocksEditor />
      </DummyFormAgentStateProvider>
    </DndContextProvider>
  );
}

/**
 * TODO: this is added while developing a v_value feature on form field. once the value computation is moved to the higher level, this can be removed.
 * @returns
 */
function DummyFormAgentStateProvider({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <FormAgentProvider initial={initdummy()}>{children}</FormAgentProvider>
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

  const supabase = createBrowserFormsClient();

  const insertBlock = useCallback(
    async (block: EditorFlatFormBlock) => {
      //
      const { data, error } = await supabase
        .from("form_block")
        .insert({
          form_id: state.form.form_id,
          type: block.type,
          form_page_id: state.document_id,
          parent_id: block.parent_id?.startsWith(DRAFT_ID_START_WITH)
            ? null
            : block.parent_id,
          local_index: block.local_index,
          form_field_id: block.form_field_id,
          body_html: block.body_html,
          src: block.src,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    [state.form.form_id, state.document_id, supabase]
  );

  useEffect(() => {
    // check for pending blocks, via id == PENDING_ID (Symbol)
    // create them on db, and update their id
    const pending_blocks = state.blocks.filter((block) =>
      block.id.startsWith(DRAFT_ID_START_WITH)
    );

    for (const block of pending_blocks) {
      insertBlock(block)
        .then((data) => {
          dispatch({
            type: "blocks/resolve",
            block_id: block.id,
            block: { ...data, v_hidden: data.v_hidden as any },
          });
        })
        .catch((e) => {
          console.error("Failed to create block", e);
          toast.error("Failed to create block");
          dispatch({
            type: "blocks/delete",
            block_id: block.id,
          });
        });
    }
  }, [dispatch, insertBlock, state.blocks]);

  return <></>;
}

function useSyncBlocks(blocks: EditorFlatFormBlock[]) {
  // TODO: add debounce

  const supabase = createBrowserFormsClient();
  const prevBlocksRef = useRef(blocks);

  useEffect(() => {
    const prevBlocks = prevBlocksRef.current;
    const updatedBlocks = blocks.filter((block) => {
      const prevBlock = prevBlocks.find((prev) => prev.id === block.id);
      return (
        !prevBlock ||
        block.type !== prevBlock.type ||
        (block.parent_id !== prevBlock.parent_id &&
          // exclude from sync if parent_id is a draft (this can happen when a new section is created and blocks are assigned to it)
          !block.parent_id?.startsWith(DRAFT_ID_START_WITH)) ||
        block.local_index !== prevBlock.local_index ||
        block.form_field_id !== prevBlock.form_field_id ||
        !shallowEqual(block.v_hidden, prevBlock.v_hidden) ||
        block.title_html !== prevBlock.title_html ||
        block.description_html !== prevBlock.description_html ||
        block.body_html !== prevBlock.body_html ||
        block.src !== prevBlock.src
      );
    });

    updatedBlocks.forEach(async (block) => {
      try {
        const { data, error } = await supabase
          .from("form_block")
          .update({
            // Assuming these are the fields to update
            type: block.type,
            parent_id: block.parent_id,
            local_index: block.local_index,
            form_field_id: block.form_field_id,
            v_hidden: block.v_hidden,
            title_html: block.title_html,
            description_html: block.description_html,
            body_html: block.body_html,
            src: block.src,
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

  const blur = useCallback(() => {
    dispatch({
      type: "blocks/blur",
    });
  }, [dispatch]);

  return (
    <div onPointerDown={blur}>
      <div className="fixed z-10">
        <div className="absolute left-4 top-4">
          <InsertCommandDialogTrigger />
        </div>
      </div>
      <div className="py-20 container mx-auto max-w-screen-sm">
        <PendingBlocksResolver />
        <OptimisticBlocksSyncProvider />
        <BlocksCanvas id="root" className="mt-10">
          <SortableContext
            items={state.blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <FormSectionStyle className="flex flex-col">
              {state.blocks.map((block, index) => {
                return (
                  <div key={block.id}>
                    <Block {...block} />
                    {index < state.blocks.length - 1 && (
                      <BlockMiddleSlot index={index + 1} />
                    )}
                  </div>
                );
              })}
            </FormSectionStyle>
          </SortableContext>
          <div className="mt-4 mb-80 w-full">
            <BlockLastSlot />
          </div>
        </BlocksCanvas>
      </div>
    </div>
  );
}

function BlockMiddleSlot({ index }: { index?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-state={expanded ? "expanded" : undefined}
      className="group relative"
    >
      <div className="absolute left-0 top-4 -translate-y-1/2 -translate-x-full opacity-0 group-hover:opacity-100 group-data-[state=expanded]:opacity-100 transition-opacity">
        <InsertCommandPopover
          index={index}
          onOpenChange={setExpanded}
          side="left"
        >
          <PopoverTrigger asChild>
            <button className="size-8 bg-primary/10 rounded-[100%_100%_6px] rotate-[-45deg] transition-colors hover:bg-primary/20 flex items-center justify-center">
              <PlusIcon className="size-4 -rotate-45 text-primary" />
            </button>
          </PopoverTrigger>
        </InsertCommandPopover>
      </div>
      <div className="w-full h-8 -mx-4">
        <span className="sr-only">Insert block here</span>
      </div>
      <div
        aria-label="slot"
        data-state={expanded ? "expanded" : undefined}
        className="h-0 m-0 opacity-0 rounded-2xl bg-primary/10 outline group-data-[state=expanded]:opacity-100 group-data-[state=expanded]:mb-4 group-data-[state=expanded]:h-16 transition-[height] duration-200 ease-in-out"
      />
    </div>
  );
}

function BlockLastSlot() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      data-state={expanded ? "expanded" : undefined}
      className="h-16 group relative"
    >
      <div className="w-full opacity-100 group-data-[state=expanded]:h-0 group-data-[state=expanded]:opacity-0">
        <div className="">
          <InsertCommandPopover
            onOpenChange={setExpanded}
            side="left"
            sideOffset={16}
            align="center"
          >
            <PopoverTrigger asChild>
              <button className="w-full h-full flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto size-8 bg-primary/10 rounded-full transition-colors hover:bg-primary/20 flex items-center justify-center">
                  <PlusIcon className="size-4 text-primary" />
                </div>
              </button>
            </PopoverTrigger>
          </InsertCommandPopover>
        </div>
      </div>
      <div
        aria-label="slot"
        data-state={expanded ? "expanded" : undefined}
        className="h-0 m-0 opacity-0 rounded-2xl bg-primary/10 outline group-data-[state=expanded]:opacity-100 group-data-[state=expanded]:mb-4 group-data-[state=expanded]:h-16 transition-[height] duration-200 ease-in-out"
      />
    </div>
  );
}

function FormSectionStyle({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  const [state] = useEditorState();
  const sectioncss = state.theme.section;

  return <section className={cn(sectioncss, className)}>{children}</section>;
}

function shallowEqual(obj1: any, obj2: any) {
  if (obj1 === obj2) return true;

  if (
    typeof obj1 !== "object" ||
    obj1 === null ||
    typeof obj2 !== "object" ||
    obj2 === null
  ) {
    return false;
  }

  let keys1 = Object.keys(obj1);
  let keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (let key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }

  return true;
}
