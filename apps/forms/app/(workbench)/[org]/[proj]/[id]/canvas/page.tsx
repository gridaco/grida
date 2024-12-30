"use client";
import React, { useCallback, useEffect, useMemo } from "react";
import { Spinner } from "@/components/spinner";
import {
  CanvasAction,
  EditorSurface,
  StandaloneDocumentContent,
  StandaloneDocumentEditor,
  ViewportRoot,
  useEventTarget,
} from "@/grida-react-canvas";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { useEditorState } from "@/scaffolds/editor";
import { composeEditorDocumentAction } from "@/scaffolds/editor/action";
import { SideControl } from "@/scaffolds/sidecontrol";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SlashIcon,
  BoxIcon,
  Pencil1Icon,
  CircleIcon,
  CursorArrowIcon,
  FrameIcon,
  ImageIcon,
  TextIcon,
} from "@radix-ui/react-icons";
import { PenToolIcon } from "lucide-react";
import {
  cursormode_to_toolbar_value,
  toolbar_value_to_cursormode,
  ToolbarToolType,
} from "@/grida-react-canvas/toolbar";
import { createClientCanvasClient } from "@/lib/supabase/client";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import type { CanvasDocumentSnapshotSchema } from "@/types";
import equal from "deep-equal";
import { grida } from "@/grida";

function useSync(
  document: grida.program.document.IDocumentDefinition | undefined
) {
  const [{ document_id }, dispatch] = useEditorState();
  const debounced = useDebounce(document, 1000);
  const prev = usePrevious(debounced);
  const supabase = useMemo(() => createClientCanvasClient(), []);

  const setSaving = useCallback(
    (saving: boolean) => dispatch({ type: "saving", saving: saving }),
    [dispatch]
  );

  useEffect(() => {
    // sync to server
    if (!equal(prev, debounced)) {
      setSaving(true);
      supabase
        .from("canvas_document")
        .update({
          data: debounced
            ? ({
                __schema_version: "2024-12-31",
                pages: {
                  one: {
                    ...debounced,
                  },
                },
              } satisfies CanvasDocumentSnapshotSchema as {})
            : null,
        })
        .eq("id", document_id!)
        .then(({ error }) => {
          if (error) console.error(error);
          setSaving(false);
        });
      return;
    }
  }, [debounced, prev, supabase, document_id, setSaving]);
}

export default function CanvasPage() {
  const [state, dispatch] = useEditorState();

  useSync(state.documents["canvas/one"]?.document);

  const {
    documents: { "canvas/one": document },
  } = state;

  const startPageDocumentDispatch = useCallback(
    (action: CanvasAction) => {
      dispatch(composeEditorDocumentAction("canvas/one", action));
    },
    [dispatch]
  );

  if (!document) {
    return <Spinner />;
  }

  return (
    <>
      <StandaloneDocumentEditor
        editable
        initial={document}
        dispatch={startPageDocumentDispatch}
      >
        <Hotkyes />
        <div className="flex w-full h-full">
          <div className="w-full h-full flex flex-col relative">
            <ViewportRoot className="relative w-full h-full no-scrollbar overflow-y-auto">
              <EditorSurface />
              <div className="w-full h-full flex items-center justify-center bg-black/5">
                <div className="shadow-lg rounded-xl border overflow-hidden">
                  <StandaloneDocumentContent />
                </div>
              </div>
              <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
                <Toolbar />
              </div>
            </ViewportRoot>
          </div>
          <aside className="hidden lg:flex h-full">
            <SideControl />
          </aside>
        </div>
      </StandaloneDocumentEditor>
    </>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}

function Toolbar() {
  const { setCursorMode, cursor_mode } = useEventTarget();

  return (
    <div className="rounded-full flex gap-4 border bg-background shadow px-4 py-2 pointer-events-auto">
      <ToggleGroup
        onValueChange={(v) => {
          setCursorMode(
            v
              ? toolbar_value_to_cursormode(v as ToolbarToolType)
              : { type: "cursor" }
          );
        }}
        value={cursormode_to_toolbar_value(cursor_mode)}
        defaultValue="cursor"
        type="single"
      >
        <ToggleGroupItem value={"cursor" satisfies ToolbarToolType}>
          <CursorArrowIcon />
        </ToggleGroupItem>
        <VerticalDivider />
        <ToggleGroupItem value={"container" satisfies ToolbarToolType}>
          <FrameIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"text" satisfies ToolbarToolType}>
          <TextIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"rectangle" satisfies ToolbarToolType}>
          <BoxIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"ellipse" satisfies ToolbarToolType}>
          <CircleIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"line" satisfies ToolbarToolType}>
          <SlashIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"pencil" satisfies ToolbarToolType}>
          <Pencil1Icon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"path" satisfies ToolbarToolType}>
          <PenToolIcon className="w-3.5 h-3.5" />
        </ToggleGroupItem>
        <ToggleGroupItem value={"image" satisfies ToolbarToolType}>
          <ImageIcon />
        </ToggleGroupItem>
        <VerticalDivider />
      </ToggleGroup>
    </div>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;
