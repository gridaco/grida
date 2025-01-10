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
import { FrameIcon, PlusIcon } from "@radix-ui/react-icons";
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
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import {
  ToolIcon,
  ToolsGroup,
} from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
import { Button } from "@/components/ui/button";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";

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
          <EditorSurfaceClipboardSyncProvider>
            <EditorSurfaceDropzone>
              <EditorSurfaceContextMenu>
                <div className="w-full h-full flex flex-col relative bg-black/5">
                  <ViewportRoot className="relative w-full h-full no-scrollbar overflow-y-auto">
                    <EditorSurface />
                    <AutoInitialFitTransformer>
                      <StandaloneDocumentContent />
                    </AutoInitialFitTransformer>
                    <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
                      <Toolbar />
                    </div>
                  </ViewportRoot>
                </div>
              </EditorSurfaceContextMenu>
            </EditorSurfaceDropzone>
          </EditorSurfaceClipboardSyncProvider>
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
  const value = cursormode_to_toolbar_value(cursor_mode);

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
        value={value}
        defaultValue="cursor"
        type="single"
      >
        <ToolsGroup
          value={value}
          options={[
            { value: "cursor", label: "Cursor", shortcut: "V" },
            { value: "hand", label: "Hand tool", shortcut: "H" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <VerticalDivider />
        <ToggleGroupItem value={"container" satisfies ToolbarToolType}>
          <FrameIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value={"text" satisfies ToolbarToolType}>
          <ToolIcon type="text" />
        </ToggleGroupItem>
        <ToolsGroup
          value={value}
          options={[
            { value: "rectangle", label: "Rectangle", shortcut: "R" },
            { value: "ellipse", label: "Ellipse", shortcut: "O" },
            { value: "line", label: "Line", shortcut: "L" },
            { value: "image", label: "Image" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
        <ToolsGroup
          value={value}
          options={[
            { value: "pencil", label: "Pencil tool", shortcut: "⇧+P" },
            { value: "path", label: "Path tool", shortcut: "P" },
          ]}
          onValueChange={(v) => {
            setCursorMode(toolbar_value_to_cursormode(v as ToolbarToolType));
          }}
        />
      </ToggleGroup>
    </div>
  );
}

const VerticalDivider = () => <div className="w-1 h-4 border-r" />;
