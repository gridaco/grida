"use client";
import React, { useCallback, useEffect, useMemo } from "react";
import { Spinner } from "@/components/spinner";
import {
  EditorSurface,
  StandaloneSceneContent,
  ViewportRoot,
} from "@/grida-react-canvas";
import { useEditorHotKeys } from "@/grida-react-canvas/viewport/hotkeys";
import { useEditorState } from "@/scaffolds/editor";
import { SideControl } from "@/scaffolds/sidecontrol";
import { createClientCanvasClient } from "@/lib/supabase/client";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import type { CanvasDocumentSnapshotSchema } from "@/types";
import equal from "deep-equal";
import { grida } from "@/grida";
import {
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
} from "@/grida-react-canvas/renderer";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import Toolbar, {
  ToolbarPosition,
} from "@/grida-react-canvas-starter-kit/starterkit-toolbar";

function useSync(document: grida.program.document.Document | undefined) {
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
                __schema_version: "0.0.1-beta.1+20250303",
                ...debounced,
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
  const [state] = useEditorState();

  const {
    documents: { canvas: document },
  } = state;

  if (!document) {
    return <Spinner />;
  }

  return <Ready />;
}

function Ready() {
  const [state] = useEditorState();

  useSync(state.documents["canvas"]?.state?.document);
  useEditorHotKeys();

  const {
    documents: { canvas: document },
  } = state;

  if (!document) {
    return <Spinner />;
  }

  return (
    <>
      <div className="flex w-full h-full">
        <EditorSurfaceClipboardSyncProvider>
          <EditorSurfaceDropzone>
            <EditorSurfaceContextMenu>
              <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                <ViewportRoot className="relative w-full h-full no-scrollbar overflow-y-auto">
                  <EditorSurface />
                  <AutoInitialFitTransformer>
                    <StandaloneSceneContent />
                  </AutoInitialFitTransformer>
                  <ToolbarPosition>
                    <Toolbar />
                  </ToolbarPosition>
                </ViewportRoot>
              </StandaloneSceneBackground>
            </EditorSurfaceContextMenu>
          </EditorSurfaceDropzone>
        </EditorSurfaceClipboardSyncProvider>
        <aside className="hidden lg:flex h-full">
          <SideControl />
        </aside>
      </div>
    </>
  );
}
