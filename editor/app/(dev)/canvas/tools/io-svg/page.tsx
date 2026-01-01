"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GridaLogo } from "@/components/grida-logo";
import { ThemedMonacoEditor } from "@/components/monaco";
import {
  EditorSurface,
  StandaloneDocumentEditor,
  ViewportRoot,
} from "@/grida-canvas-react";
import grida from "@grida/schema";
import { v4 } from "uuid";
import { useFilePicker } from "use-file-picker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHotkeys } from "react-hotkeys-hook";
import { editor } from "@/grida-canvas";
import iosvg from "@grida/io-svg";
import Link from "next/link";
import { useEditor } from "@/grida-canvas-react";
import { WithSize } from "@/grida-canvas-react/viewport/size";
import { useDPR } from "@/grida-canvas-react/viewport/hooks/use-dpr";
import type { Editor as GridaEditor } from "@/grida-canvas/editor";

export default function IOSVGPage() {
  const [raw, setRaw] = useState<string>();
  const { openFilePicker, filesContent } = useFilePicker({
    readAs: "Text",
    multiple: false,
    accept: ".svg",
  });

  const instance = useEditor(undefined, "canvas");
  const optimizedSvg = useOptimizedSvg(raw, instance);
  const { result, packedScene } = useIOSVGDocument(raw, instance);
  const canvasRef = useCanvasSurfaceMount(instance);

  useHotkeys("ctrl+o, meta+o", openFilePicker, {
    preventDefault: true,
  });

  useEffect(() => {
    if (filesContent.length === 0) {
      return;
    }
    const svgstr = filesContent[0].content;
    setRaw(svgstr);
  }, [filesContent]);

  return (
    <main className="w-dvw h-dvh overflow-hidden">
      <div className="flex flex-col w-full h-full">
        <header className="flex items-center justify-between p-4 border-b">
          <div className="flex gap-4 items-center">
            <Link href="/canvas">
              <GridaLogo className="size-4" />
            </Link>
            <div className="flex flex-col">
              <span className="text-sm font-bold font-mono">tools/io-svg</span>
            </div>
          </div>
          {/*  */}
          <Button onClick={openFilePicker}>Open SVG ⌘+O</Button>
        </header>
        <div className="flex w-full h-full">
          <aside className="flex-1 h-full w-full space-y-4">
            <section className="h-1/2 w-full flex flex-col space-y-2 min-h-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                SVG
              </span>
              <Tabs
                defaultValue="original"
                className="flex flex-col h-full min-h-0"
              >
                <TabsList className="w-fit">
                  <TabsTrigger value="original">Original</TabsTrigger>
                  <TabsTrigger value="optimized">Optimized</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="original"
                  className="flex-1 min-h-0 mt-0 focus-visible:outline-none"
                >
                  <ThemedMonacoEditor
                    width="100%"
                    height="100%"
                    language="xml"
                    value={raw ?? ""}
                    onChange={setRaw}
                    options={{ readOnly: false }}
                  />
                </TabsContent>
                <TabsContent
                  value="optimized"
                  className="flex-1 min-h-0 mt-0 focus-visible:outline-none"
                >
                  <ThemedMonacoEditor
                    width="100%"
                    height="100%"
                    language="xml"
                    value={optimizedSvg ?? ""}
                    options={{ readOnly: true }}
                  />
                </TabsContent>
              </Tabs>
            </section>
            <hr className="border-t" />
            <section className="h-1/2 w-full flex flex-col space-y-2 min-h-0">
              <Tabs
                defaultValue="scene"
                className="flex flex-col h-full min-h-0"
              >
                <TabsList className="w-fit">
                  <TabsTrigger value="scene">Scene</TabsTrigger>
                  <TabsTrigger value="scene-wasm">Scene (WASM)</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="scene"
                  className="flex-1 min-h-0 mt-0 focus-visible:outline-none"
                >
                  <ThemedMonacoEditor
                    width="100%"
                    height="100%"
                    language="json"
                    value={JSON.stringify(result, null, 2)}
                    options={{ readOnly: true }}
                  />
                </TabsContent>
                <TabsContent
                  value="scene-wasm"
                  className="flex-1 min-h-0 mt-0 focus-visible:outline-none"
                >
                  <ThemedMonacoEditor
                    width="100%"
                    height="100%"
                    language="json"
                    value={packedScene ?? ""}
                    options={{ readOnly: true }}
                  />
                </TabsContent>
              </Tabs>
            </section>
          </aside>
          <aside className="flex-1 h-full w-full">
            <div className="flex gap-2">
              <section className="flex-1">
                <span className="text-sm font-bold font-mono">
                  Grida Preview
                </span>
                <div className="w-full border h-96">
                  <StandaloneDocumentEditor editor={instance}>
                    <ViewportRoot className="relative w-full h-full p-4">
                      <EditorSurface />
                      <CanvasSurface ref={canvasRef} />
                    </ViewportRoot>
                  </StandaloneDocumentEditor>
                </div>
                <hr className="border-t my-4" />
                <span className="text-sm font-bold font-mono">
                  Raw SVG Preview
                </span>
                <div className="flex w-full h-96 p-4 border overflow-scroll">
                  <div className="flex-1">
                    {raw ? (
                      <img
                        src={`data:image/svg+xml;utf8,${encodeURIComponent(raw)}`}
                        alt="raw svg"
                        className="max-w-full"
                      />
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

const CanvasSurface = React.forwardRef<HTMLCanvasElement, {}>(
  function CanvasSurface(_, ref) {
    const dpr = useDPR();

    return (
      <WithSize className="absolute inset-0 w-full h-full">
        {({ width, height }) => (
          <canvas
            ref={ref}
            width={Math.max(1, width) * dpr}
            height={Math.max(1, height) * dpr}
            style={{
              width,
              height,
              display: "block",
            }}
          />
        )}
      </WithSize>
    );
  }
);

function useCanvasSurfaceMount(editorInstance: GridaEditor) {
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasNode) {
      activeCanvasRef.current = null;
      return;
    }

    if (activeCanvasRef.current === canvasNode) {
      return;
    }

    activeCanvasRef.current = canvasNode;
    let cancelled = false;

    const dpr = window.devicePixelRatio || 1;
    editorInstance.mount(canvasNode, dpr).catch((error) => {
      if (!cancelled) {
        console.error("Failed to mount canvas surface", error);
      }
    });

    return () => {
      cancelled = true;
      if (activeCanvasRef.current === canvasNode) {
        activeCanvasRef.current = null;
      }
    };
  }, [canvasNode, editorInstance]);

  return useCallback((node: HTMLCanvasElement | null) => {
    setCanvasNode(node);
  }, []);
}

function useOptimizedSvg(raw?: string, editorInstance?: GridaEditor) {
  return useMemo(() => {
    if (!raw || !editorInstance?.svgProvider) {
      return undefined;
    }
    return editorInstance.svgProvider.svgOptimize(raw) ?? undefined;
  }, [raw, editorInstance]);
}

function useIOSVGDocument(
  raw: string | undefined,
  editorInstance: GridaEditor
) {
  const [conversion, setConversion] = useState<any>();
  const [packedSceneJson, setPackedSceneJson] = useState<string>();

  useEffect(() => {
    if (!raw) {
      setConversion(undefined);
      setPackedSceneJson(undefined);
      return;
    }

    const packed = editorInstance.svgPack(raw);

    if (!packed) {
      setConversion(undefined);
      setPackedSceneJson(undefined);
      return;
    }

    // Store packed scene JSON for display
    setPackedSceneJson(JSON.stringify(packed, null, 2));

    // Use convert with the WASM-resolved SVG tree
    const result = iosvg.convert(packed.svg, {
      name: "SVG",
    });

    if (result) {
      const doc =
        grida.program.nodes.factory.packed_scene_document_to_full_document(
          grida.program.nodes.factory.create_packed_scene_document_from_prototype(
            result,
            () => v4()
          )
        );

      editorInstance.commands.reset(
        editor.state.init({
          editable: true,
          document: doc,
        })
      );
    }
    setConversion(result);
  }, [raw, editorInstance]);

  return { result: conversion, packedScene: packedSceneJson };
}
