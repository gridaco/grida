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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHotkeys } from "react-hotkeys-hook";
import { useFilePicker } from "use-file-picker";
import Link from "next/link";
import { useEditor } from "@/grida-canvas-react";
import type { Editor as GridaEditor } from "@/grida-canvas/editor";

export default function IOMarkdownPage() {
  const [markdown, setMarkdown] = useState<string>(
    "# Hello World\n\nThis is **markdown** text."
  );
  const { openFilePicker, filesContent } = useFilePicker({
    readAs: "Text",
    multiple: false,
    accept: ".md",
  });

  const instance = useEditor(undefined, "canvas");
  const html = useMarkdownToHtml(markdown, instance);
  const canvasRef = useCanvasSurfaceMount(instance);

  useHotkeys("ctrl+o, meta+o", openFilePicker, {
    preventDefault: true,
  });

  useEffect(() => {
    if (filesContent.length === 0) {
      return;
    }
    const markdownContent = filesContent[0].content;
    setMarkdown(markdownContent);
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
              <span className="text-sm font-bold font-mono">
                tools/io-markdown
              </span>
            </div>
          </div>
          <Button onClick={openFilePicker}>Open Markdown ⌘+O</Button>
        </header>
        <div className="flex w-full h-full">
          <aside className="flex-1 h-full w-full border-r">
            <section className="h-full w-full flex flex-col space-y-2 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Markdown
              </span>
              <ThemedMonacoEditor
                width="100%"
                height="100%"
                language="markdown"
                value={markdown}
                onChange={(value) => setMarkdown(value ?? "")}
                options={{ readOnly: false }}
              />
            </section>
          </aside>
          <aside className="flex-1 h-full w-full">
            {/* Hidden canvas to initialize WASM */}
            <canvas
              ref={canvasRef}
              width={1}
              height={1}
              style={{ display: "none" }}
            />
            <section className="h-full w-full flex flex-col space-y-2 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                HTML Output
              </span>
              <Tabs
                defaultValue="preview"
                className="flex flex-col h-full min-h-0"
              >
                <TabsList className="w-fit">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                </TabsList>
                <TabsContent
                  value="preview"
                  className="flex-1 min-h-0 mt-0 focus-visible:outline-none border rounded p-4 overflow-auto"
                >
                  {html ? (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      {instance?.markdownProvider
                        ? "No HTML output available"
                        : "Loading WASM module..."}
                    </div>
                  )}
                </TabsContent>
                <TabsContent
                  value="html"
                  className="flex-1 min-h-0 mt-0 focus-visible:outline-none"
                >
                  <ThemedMonacoEditor
                    width="100%"
                    height="100%"
                    language="html"
                    value={html ?? ""}
                    options={{ readOnly: true }}
                  />
                </TabsContent>
              </Tabs>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

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

function useMarkdownToHtml(
  markdown: string | undefined,
  editorInstance?: GridaEditor
) {
  return useMemo(() => {
    if (!markdown) {
      return undefined;
    }
    if (!editorInstance?.markdownProvider) {
      console.log("Markdown provider not available yet");
      return undefined;
    }
    try {
      const result = editorInstance.markdownToHtml(markdown);
      console.log("Markdown conversion result:", result ? "success" : "null");
      return result ?? undefined;
    } catch (error) {
      console.error("Markdown conversion error:", error);
      return undefined;
    }
  }, [markdown, editorInstance]);
}
