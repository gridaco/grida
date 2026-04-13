"use client";

import React, { useCallback, useState } from "react";
import {
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import {
  SlideList,
  SlideLayersList,
  SlideSurface,
  SlideSidebarFocusScope,
  SlideMenuContent,
} from "@/grida-canvas-react-starter-kit/starterkit-slides";
import { StandaloneDocumentEditor, useEditorState } from "@/grida-canvas-react";
import {
  useSlideEditor,
  SlideEditorModeProvider,
} from "@/grida-canvas-react/use-slide-editor";
import { useSlideKeybindings } from "@/grida-canvas-react/viewport/slide-hotkeys";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { PlaygroundToolbar } from "@/grida-canvas-hosted/playground/uxhost-toolbar";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroupLabel,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { PlusIcon } from "@radix-ui/react-icons";
import { PlayIcon } from "lucide-react";
import { PreviewProvider } from "@/grida-canvas-react-starter-kit/starterkit-preview";
import { PresentationOverlay } from "@/grida-canvas-react/presentation-overlay";
import type { PresentationEngineOptions } from "@/grida-canvas/presentation-engine";
import { GridaLogo } from "@/components/grida-logo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WindowGlobalCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  createInitialSlidesDocument,
  type SlideEditorMode,
} from "@/grida-canvas/modes/slide-mode";

const SLIDES_DOCUMENT = createInitialSlidesDocument();

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SlidesPlaygroundPage() {
  const { editor: instance, slideMode } = useSlideEditor(SLIDES_DOCUMENT);
  const fonts = useEditorState(instance, (state) => state.webfontlist.items);
  const [presentationData, setPresentationData] =
    useState<PresentationEngineOptions | null>(null);

  const onPresent = useCallback(() => {
    if (!slideMode) return;
    setPresentationData(slideMode.getPresentationData());
  }, [slideMode]);

  const onExitPresentation = useCallback(() => {
    setPresentationData(null);
  }, []);

  // slideMode is null on the first render (constructed in useEffect for SSR safety).
  if (!slideMode) return null;

  return (
    <TooltipProvider>
      <FontFamilyListProvider fonts={fonts}>
        <StandaloneDocumentEditor editor={instance}>
          <SlideEditorModeProvider mode={slideMode}>
            <SidebarProvider className="w-screen h-screen overflow-hidden">
              <main className="w-full h-full select-none relative">
                <WindowGlobalCurrentEditorProvider />
                <PreviewProvider>
                  <SlidesHotkeys slideMode={slideMode} />
                  <div className="flex w-full h-full">
                    <SlidesSidebar slideMode={slideMode} />
                    <SlideSurface>
                      <ToolbarPosition>
                        <PlaygroundToolbar />
                      </ToolbarPosition>
                    </SlideSurface>
                    <SidebarRight onPresent={onPresent} />
                  </div>
                </PreviewProvider>
                {presentationData && (
                  <PresentationOverlay
                    {...presentationData}
                    onExit={onExitPresentation}
                  />
                )}
              </main>
            </SidebarProvider>
          </SlideEditorModeProvider>
        </StandaloneDocumentEditor>
      </FontFamilyListProvider>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Left sidebar
// ---------------------------------------------------------------------------

function SlidesSidebar({ slideMode }: { slideMode: SlideEditorMode }) {
  return (
    <Sidebar side="left">
      <SidebarHeader className="p-0">
        <header className="h-11 min-h-11 flex items-center px-4 border-b gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="me-1 outline-none">
              <GridaLogo className="inline-block size-4" />
            </DropdownMenuTrigger>
            <SlideMenuContent />
          </DropdownMenu>
          <span className="font-bold text-xs flex-1">Slides</span>
          <button
            onClick={() => slideMode.addSlide()}
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
            <ResizablePanel defaultSize={65} minSize={20}>
              <div className="h-full overflow-y-auto p-2">
                <SlideList />
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={35} minSize={10}>
              <div className="flex flex-col h-full overflow-hidden">
                <SidebarGroupLabel className="shrink-0">
                  Layers
                </SidebarGroupLabel>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <SlideLayersList />
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

function SidebarRight({ onPresent }: { onPresent: () => void }) {
  return (
    <Sidebar side="right">
      <SidebarHeader className="border-b p-0">
        <header className="flex h-11 px-2 justify-between items-center gap-2">
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <Zoom
              className={cn(
                WorkbenchUI.inputVariants({ variant: "input", size: "xs" }),
                "w-auto"
              )}
            />
            <button
              onClick={onPresent}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Present"
              title="Present (fullscreen)"
            >
              <PlayIcon className="size-3.5" />
            </button>
          </div>
        </header>
      </SidebarHeader>
      <SidebarContent>
        <Selection />
      </SidebarContent>
    </Sidebar>
  );
}

// ---------------------------------------------------------------------------
// Hotkeys
// ---------------------------------------------------------------------------

function SlidesHotkeys({ slideMode }: { slideMode: SlideEditorMode }) {
  useSlideKeybindings(slideMode);
  return null;
}
