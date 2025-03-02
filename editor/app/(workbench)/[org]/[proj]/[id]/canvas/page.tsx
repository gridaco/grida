"use client";
import React, { useCallback, useEffect, useMemo } from "react";
import { Spinner } from "@/components/spinner";
import {
  CanvasAction,
  EditorSurface,
  StandaloneDocumentContent,
  StandaloneDocumentEditor,
  ViewportRoot,
} from "@/grida-react-canvas";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { useEditorState } from "@/scaffolds/editor";
import { composeEditorDocumentAction } from "@/scaffolds/editor/action";
import { SideControl } from "@/scaffolds/sidecontrol";
import { createClientCanvasClient } from "@/lib/supabase/client";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import type { CanvasDocumentSnapshotSchema } from "@/types";
import equal from "deep-equal";
import { grida } from "@/grida";
import {
  AutoInitialFitTransformer,
  StandaloneDocumentBackground,
} from "@/grida-react-canvas/renderer";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import Toolbar from "@/grida-react-canvas-starter-kit/starterkit-toolbar";

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
                __schema_version: "2025-03-03",
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
                <StandaloneDocumentBackground className="w-full h-full flex flex-col relative ">
                  <ViewportRoot className="relative w-full h-full no-scrollbar overflow-y-auto">
                    <EditorSurface />
                    <AutoInitialFitTransformer>
                      <StandaloneDocumentContent />
                    </AutoInitialFitTransformer>
                    <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
                      <Toolbar />
                    </div>
                  </ViewportRoot>
                </StandaloneDocumentBackground>
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
