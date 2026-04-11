"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { NodeHierarchyList } from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";
import {
  SlideList,
  SlideSidebarFocusScope,
  useSlidesHotKeys,
  useAddSlide,
} from "@/grida-canvas-react-starter-kit/starterkit-slides";
import {
  StandaloneDocumentEditor,
  ViewportRoot,
  EditorSurface,
  StandaloneSceneBackground,
  useCurrentEditor,
  useEditorState,
  useEditor,
} from "@/grida-canvas-react";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { PlaygroundToolbar } from "@/grida-canvas-hosted/playground/uxhost-toolbar";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarProvider,
} from "@/components/ui/sidebar";
import grida from "@grida/schema";
import kolor from "@grida/color";
import { PlusIcon } from "@radix-ui/react-icons";
import type { editor as editorTypes } from "@/grida-canvas";
import {
  PreviewProvider,
  PreviewButton,
} from "@/grida-canvas-react-starter-kit/starterkit-preview";
import { GridaLogo } from "@/components/grida-logo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlaygroundMenuContent } from "@/grida-canvas-hosted/playground/uxhost-menu";
import { WithSize } from "@/grida-canvas-react/viewport/size";
import { useDPR } from "@/grida-canvas-react/viewport/hooks/use-dpr";
import { WindowGlobalCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

// ---------------------------------------------------------------------------
// Initial document — single scene with one 16:9 tray per slide
// ---------------------------------------------------------------------------
//
// A slides document is a single scene ("slides-root") whose root children
// are 1920×1080 `TrayNode`s — one per slide. See docs/wg/feat-slides/plan.md
// for the architectural rationale.

const SLIDES_DOCUMENT: editorTypes.state.IEditorStateInit = {
  editable: true,
  debug: false,
  document: {
    scenes_ref: ["slides-root"],
    links: {
      "slides-root": ["slide-1"],
    },
    nodes: {
      "slides-root": {
        type: "scene",
        id: "slides-root",
        name: "Slides",
        active: true,
        locked: false,
        guides: [],
        edges: [],
        constraints: { children: "multiple" },
        background_color: kolor.colorformats.RGBA32F.WHITESMOKE,
      },
      "slide-1": {
        type: "tray",
        id: "slide-1",
        name: "Slide 1",
        active: true,
        locked: false,
        layout_positioning: "absolute",
        layout_inset_left: 0,
        layout_inset_top: 0,
        layout_target_width: 1920,
        layout_target_height: 1080,
        rotation: 0,
        opacity: 1,
        corner_radius: 0,
        fill: {
          type: "solid",
          color: kolor.colorformats.RGBA32F.WHITE,
          active: true,
        },
        stroke_width: 0,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
      } satisfies grida.program.nodes.TrayNode,
    },
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SlidesPlaygroundPage() {
  const instance = useEditor(SLIDES_DOCUMENT, "canvas");
  const fonts = useEditorState(instance, (state) => state.webfontlist.items);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );
  const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node);
  }, []);

  // Mount WASM canvas backend
  useEffect(() => {
    if (!canvasElement) return;

    let cancelled = false;
    const dpr = window.devicePixelRatio || 1;
    instance
      .mount(canvasElement, dpr)
      .then(() => {
        if (!cancelled) {
          // mounted
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to mount canvas surface", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canvasElement, instance]);

  return (
    <TooltipProvider>
      <FontFamilyListProvider fonts={fonts}>
        <StandaloneDocumentEditor editor={instance}>
          <SidebarProvider className="w-screen h-screen overflow-hidden">
            <main className="w-full h-full select-none relative">
              <WindowGlobalCurrentEditorProvider />
              <PreviewProvider>
                <SlidesHotkeys />
                <SlideIsolationCameraFit />
                <div className="flex w-full h-full">
                  {/* Left: Slide thumbnails */}
                  <SlidesSidebar />

                  {/* Center: Canvas */}
                  <EditorSurfaceClipboardSyncProvider />
                  <EditorSurfaceDropzone>
                    <EditorSurfaceContextMenu>
                      <StandaloneSceneBackground className="w-full h-full flex flex-col relative">
                        <ViewportRoot className="relative w-full h-full overflow-hidden">
                          <EditorSurface />
                          <Canvas ref={handleCanvasRef} />
                          <ToolbarPosition>
                            <PlaygroundToolbar />
                          </ToolbarPosition>
                        </ViewportRoot>
                      </StandaloneSceneBackground>
                    </EditorSurfaceContextMenu>
                  </EditorSurfaceDropzone>

                  {/* Right: Inspector */}
                  <SidebarRight />
                </div>
              </PreviewProvider>
            </main>
          </SidebarProvider>
        </StandaloneDocumentEditor>
      </FontFamilyListProvider>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// WASM canvas element
// ---------------------------------------------------------------------------

function Canvas({ ref }: { ref?: (canvas: HTMLCanvasElement | null) => void }) {
  const dpr = useDPR();

  return (
    <WithSize
      className="w-full h-full max-w-full max-h-full"
      style={{ contain: "strict" }}
    >
      {({ width, height }) => (
        <canvas
          id="canvas"
          ref={ref}
          width={width * dpr}
          height={height * dpr}
          style={{ width, height }}
        />
      )}
    </WithSize>
  );
}

// useAddSlide is imported from starterkit-slides

// ---------------------------------------------------------------------------
// Left sidebar
// ---------------------------------------------------------------------------

function SlidesSidebar() {
  const addSlide = useAddSlide();

  return (
    <Sidebar side="left">
      <SidebarHeader className="p-0">
        <header className="h-11 min-h-11 flex items-center px-4 border-b gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="me-1 outline-none">
              <GridaLogo className="inline-block size-4" />
            </DropdownMenuTrigger>
            <PlaygroundMenuContent />
          </DropdownMenu>
          <span className="font-bold text-xs flex-1">Slides</span>
          <button
            onClick={addSlide}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Add slide"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </header>
      </SidebarHeader>
      <SidebarContent className="p-0 overflow-hidden">
        <SlideSidebarFocusScope>
          <ResizablePanelGroup orientation="vertical">
            {/* Slide thumbnails with D&D */}
            <ResizablePanel defaultSize={65} minSize={20}>
              <div className="h-full overflow-y-auto p-2">
                <SlideList />
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* Layers for current slide */}
            <ResizablePanel defaultSize={35} minSize={10}>
              <div className="flex flex-col h-full overflow-hidden">
                <SidebarGroupLabel className="shrink-0">
                  Layers
                </SidebarGroupLabel>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <NodeHierarchyList />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </SlideSidebarFocusScope>
      </SidebarContent>
    </Sidebar>
  );
}

// ---------------------------------------------------------------------------
// Right sidebar
// ---------------------------------------------------------------------------

function SidebarRight() {
  const editor = useCurrentEditor();
  const fonts = useEditorState(editor, (state) => state.webfontlist.items);

  return (
    <Sidebar side="right">
      <SidebarHeader className="border-b p-0">
        <header className="flex h-11 px-2 justify-between items-center gap-2">
          <div className="flex-1" />
          <div className="flex items-center">
            <Zoom
              className={cn(
                WorkbenchUI.inputVariants({ variant: "input", size: "xs" }),
                "w-auto"
              )}
            />
            <PreviewButton />
          </div>
        </header>
      </SidebarHeader>
      <SidebarContent>
        <FontFamilyListProvider fonts={fonts}>
          <Selection />
        </FontFamilyListProvider>
      </SidebarContent>
    </Sidebar>
  );
}

// ---------------------------------------------------------------------------
// Slides-specific hotkeys (arrows navigate slides when nothing selected)
// ---------------------------------------------------------------------------

function SlidesHotkeys() {
  useSlidesHotKeys();
  return null;
}

// ---------------------------------------------------------------------------
// Isolation + Camera — scope viewport to the currently isolated slide
// ---------------------------------------------------------------------------
//
// `isolation_root_node_id` in editor state is the single source of truth
// for "which slide am I viewing". It is independent of selection.
//
// On mount, if no isolation is set yet, we default to the first tray.
// Camera fit reacts to isolation changes, not selection changes.

function SlideIsolationCameraFit() {
  const editor = useCurrentEditor();

  const isolationNodeId = useEditorState(
    editor,
    (state) => state.isolation_root_node_id
  );

  // On mount: if no isolation is set, default to the first root tray.
  useEffect(() => {
    if (editor.state.isolation_root_node_id !== null) return;
    const scene_id = editor.state.scene_id;
    if (!scene_id) return;
    const root_ids = editor.state.document.links[scene_id] ?? [];
    const firstTray = root_ids.find(
      (id) => editor.state.document.nodes[id]?.type === "tray"
    );
    if (firstTray) {
      editor.doc.setIsolation(firstTray);
    }
    // Only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear isolation on unmount (e.g. navigating away from the slides page).
  useEffect(() => {
    return () => {
      editor.doc.setIsolation(null);
    };
  }, [editor]);

  // Fit the camera to the isolated tray whenever it changes.
  useEffect(() => {
    if (!isolationNodeId) return;
    // Defer by one frame so any pending WASM layout commits before we
    // read the tray's bounds via camera.fit's geometry query.
    const id = requestAnimationFrame(() => {
      editor.camera.fit([isolationNodeId], { margin: 64 });
    });
    return () => cancelAnimationFrame(id);
  }, [isolationNodeId, editor]);

  return null;
}
