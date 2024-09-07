"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef } from "react";
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
import { createClientFormsClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { InsertMenuTrigger } from "./insert-menu-trigger";
import { SectionStyle } from "../agent/theme";
import { usePrevious } from "@uidotdev/usehooks";
import equal from "deep-equal";
import { FormPageBackgroundSchema, FormStyleSheetV1Schema } from "@/types";
import { FormAgentProvider, initdummy } from "@/lib/formstate";
import { Button } from "@/components/ui/button";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import clsx from "clsx";
import common from "@/i18n/resources.common";

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

  const supabase = createClientFormsClient();

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

  const supabase = createClientFormsClient();
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

function LangSyncProvider({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  const { document_id } = state;
  const prev = usePrevious(state.document.g11n);
  const supabase = useMemo(() => createClientFormsClient(), []);

  useEffect(() => {
    if (!prev) {
      return;
    }

    // sync lang to server
    if (!equal(prev, state.document.g11n)) {
      // update lang
      supabase
        .from("form_document")
        .update({
          lang: state.document.g11n.lang,
        })
        .eq("id", document_id!)
        .then(({ error }) => {
          if (error) console.error(error);
        });
    }
  }, [prev, document_id, state.document.g11n]);
  return <>{children}</>;
}

function AgentThemeSyncProvider({ children }: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  const { document_id, document, theme } = state;
  const prev = usePrevious(state.theme);
  const supabase = useMemo(() => createClientFormsClient(), []);

  useEffect(() => {
    if (!prev) {
      return;
    }

    // sync theme to server

    if (!equal(prev, state.theme)) {
      supabase
        .from("form_document")
        .update({
          is_powered_by_branding_enabled: theme.is_powered_by_branding_enabled,
          stylesheet: {
            appearance: theme.appearance,
            custom: theme.customCSS,
            "font-family": theme.fontFamily,
            palette: theme.palette,
            section: theme.section,
          } satisfies FormStyleSheetV1Schema,
          background: theme.background satisfies
            | FormPageBackgroundSchema
            | undefined as {},
        })
        .eq("id", document_id!)
        .then(({ error }) => {
          if (error) console.error(error);
        });
      return;
    }
  }, [
    state.theme,
    prev,
    supabase,
    document_id,
    theme.is_powered_by_branding_enabled,
    theme.appearance,
    theme.customCSS,
    theme.fontFamily,
    theme.palette,
    theme.section,
    theme.background,
  ]);

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
          <InsertMenuTrigger />
        </div>
      </div>
      <div className="py-20 container mx-auto max-w-screen-sm">
        <PendingBlocksResolver />
        <OptimisticBlocksSyncProvider />
        <AgentThemeSyncProvider />
        <LangSyncProvider />
        <BlocksCanvas id="root" className="mt-10">
          <SortableContext
            items={state.blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <SectionStyle className="flex flex-col gap-4 ">
              {state.blocks.map((block) => {
                return (
                  <div key={block.id}>
                    <Block {...block} />
                  </div>
                );
              })}
            </SectionStyle>
          </SortableContext>
        </BlocksCanvas>
        <FooterPreview />
      </div>
    </div>
  );
}

function FooterPreview() {
  const [state] = useEditorState();

  const {
    theme: { is_powered_by_branding_enabled },
    document: { g11n },
  } = state;

  return (
    <>
      <footer
        className={clsx(
          "mt-4",
          "sticky bottom-0",
          "flex gap-2 p-4 pt-4 border-t",
          "justify-end bg-background",
          "md:static md:justify-start md:bg-transparent md:dark:bg-transparent",
          "w-full md:w-auto"
        )}
      >
        <Button type="button">{common[g11n.lang].submit}</Button>
      </footer>
      {is_powered_by_branding_enabled && (
        <div className="hidden md:block">
          <PoweredByGridaFooter />
        </div>
      )}
    </>
  );
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
