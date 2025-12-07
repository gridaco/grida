"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { SidebarRoot } from "@/components/sidebar";
import {
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { DocumentProperties } from "@/scaffolds/sidecontrol/sidecontrol-document-properties";
import { DocumentHierarchy } from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
  UserCustomTemplatesProvider,
  type UserCustomTemplatesProps,
  useEditorState,
  useCurrentEditor,
  useEditor,
} from "@/grida-canvas-react";
import {
  useContentEditModeMinimalState,
  useCurrentSceneState,
  useToolState,
} from "@/grida-canvas-react/provider";
import { GridaLogo } from "@/components/grida-logo";
import { DevtoolsPanel } from "@/grida-canvas-react/devtools";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
} from "@/components/ui/sidebar";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { saveAs } from "file-saver";
import { v4 } from "uuid";
import { HelpFab } from "@/scaffolds/globals/editor-help-fab";
import { Badge } from "@/components/ui/badge";
import { PlaygroundToolbar } from "./uxhost-toolbar";
import {
  Tabs,
  SidebarTabsContent,
  SidebarTabsList,
  SidebarTabsTrigger,
} from "@/components/ui-editor/sidebar-tabs";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { useEditorHotKeys } from "@/grida-canvas-react/viewport/hotkeys";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./error-boundary";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import BrushToolbar from "@/grida-canvas-react-starter-kit/starterkit-toolbar/brush-toolbar";
import ArtboardsList from "@/grida-canvas-react-starter-kit/starterkit-artboard-list";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  PreviewButton,
  PreviewProvider,
} from "@/grida-canvas-react-starter-kit/starterkit-preview";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { DarwinSidebarHeaderDragArea } from "../../host/desktop";
import { editor } from "@/grida-canvas";
import useDisableSwipeBack from "@/grida-canvas-react/viewport/hooks/use-disable-browser-swipe-back";
import { WindowGlobalCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import { LibraryContent } from "./library";
import { EditorYSyncPlugin } from "@/grida-canvas/plugins/yjs";
import { Editor } from "@/grida-canvas/editor";
import { PlayerAvatar } from "@/components/multiplayer/avatar";
import colors, {
  neutral_colors,
  randomcolorname,
} from "@/theme/tailwindcolors";
import { PathToolbar } from "@/grida-canvas-react-starter-kit/starterkit-toolbar/path-toolbar";
import { FullscreenLoadingOverlay } from "@/grida-canvas-react-starter-kit/starterkit-loading/loading";
import { CursorChat } from "@/components/multiplayer/cursor-chat";
import { distro } from "../distro";
import { WithSize } from "@/grida-canvas-react/viewport/size";
import { useDPR } from "@/grida-canvas-react/viewport/hooks/use-dpr";
import { AgentPanel } from "@/grida-canvas-hosted/ai/scaffold";
import { AgentChatProvider } from "@/grida-canvas-hosted/ai/scaffold/chat-provider";
import { PlaygroundMenuContent } from "./uxhost-menu";

// Custom hook for managing UI layout state
function useUILayout() {
  const [uiVariant, setUIVariant] = useState<distro.ui.UILayoutVariant>("full");
  const [lastVisibleVariant, setLastVisibleVariant] = useState<
    "full" | "minimal"
  >("full");
  const [rightSidebarTab, setRightSidebarTab] = useState<"inspect" | "agent">(
    "inspect"
  );

  const ui = useMemo(() => distro.ui.LAYOUT_VARIANTS[uiVariant], [uiVariant]);

  const toggleVisibility = useCallback(() => {
    setUIVariant((current) => {
      if (current === "hidden") {
        return lastVisibleVariant; // Return to last visible state
      }
      setLastVisibleVariant(current as "full" | "minimal"); // Remember current state
      return "hidden";
    });
  }, [lastVisibleVariant]);

  const toggleMinimal = useCallback(() => {
    setUIVariant((current) => {
      if (current === "hidden") {
        return "full"; // Don't toggle if hidden
      }
      const newVariant = current === "full" ? "minimal" : "full";
      setLastVisibleVariant(newVariant);
      return newVariant;
    });
  }, []);

  return {
    ui,
    uiVariant,
    rightSidebarTab,
    toggleVisibility,
    toggleMinimal,
    setRightSidebarTab,
  };
}

// Get or create a persistent cursor ID for this browser tab
const get_or_create_demo_session_cursor_id = (): string => {
  const storageKey = `grida-canvas-playground-current-session-cursor-id`;

  // Try to get existing cursor ID from session storage
  if (typeof window !== "undefined" && window.sessionStorage) {
    const existingId = window.sessionStorage.getItem(storageKey);
    if (existingId) {
      return existingId;
    }
  }

  // Generate new cursor ID if none exists
  const newId = `cursor-${v4()}`;

  // Store it in session storage for persistence across refreshes
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem(storageKey, newId);
  }

  return newId;
};

function useSyncMultiplayerCursors(editor: Editor, room_id?: string) {
  const pluginRef = useRef<EditorYSyncPlugin | null>(null);

  useEffect(() => {
    if (!room_id) return;

    const cursorId = get_or_create_demo_session_cursor_id();

    if (!pluginRef.current) {
      pluginRef.current = new EditorYSyncPlugin(editor, room_id, {
        cursor_id: cursorId,
        palette: colors[randomcolorname({ exclude: neutral_colors })],
      });
    }

    return () => {
      if (pluginRef.current) {
        pluginRef.current.destroy();
        pluginRef.current = null;
      }
    };
  }, [editor, room_id]);
}

export type CanvasPlaygroundProps = {
  src?: string;
  document?: editor.state.IEditorStateInit;
  room_id?: string;
  backend?: "dom" | "canvas";
} & Partial<UserCustomTemplatesProps>;

export default function CanvasPlayground({
  document = distro.playground.EMPTY_DOCUMENT,
  backend = "dom",
  templates,
  src,
  room_id,
}: CanvasPlaygroundProps) {
  const instance = useEditor(document, backend);
  useDisableSwipeBack();
  useSyncMultiplayerCursors(instance, room_id);
  const fonts = useEditorState(instance, (state) => state.webfontlist.items);
  const [documentReady, setDocumentReady] = useState(() => !src);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );
  const [errmsg, setErrmsg] = useState<string | null>(null);
  const [loadingOverlay, setLoadingOverlay] = useState(true);
  const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node);
  }, []);

  useEffect(() => {
    if (backend !== "canvas") {
      setCanvasReady(true);
      return;
    }

    if (!canvasElement) {
      setCanvasReady(false);
      return;
    }

    let cancelled = false;
    setCanvasReady(false);

    instance
      .mount(canvasElement)
      .then(() => {
        if (!cancelled) {
          setCanvasReady(true);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setErrmsg("Failed to mount canvas surface");
        console.error("Failed to mount canvas surface", error);
      });

    return () => {
      cancelled = true;
    };
  }, [backend, canvasElement, instance]);

  useEffect(() => {
    let cancelled = false;

    if (!src) {
      setDocumentReady(!!document);
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    setDocumentReady(false);

    const load = async () => {
      try {
        const res = await fetch(src, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(
            `Failed to fetch document: ${res.status} ${res.statusText}`
          );
        }
        const file = await res.json();
        if (cancelled) {
          return;
        }
        console.log("file.document", file.document);
        instance.commands.reset(
          editor.state.init({
            editable: true,
            document: file.document,
          }),
          src
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load playground document", error);
      } finally {
        if (!cancelled) {
          setDocumentReady(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [document, instance, src]);

  const ready = documentReady && canvasReady;

  return (
    <>
      {loadingOverlay && (
        <FullscreenLoadingOverlay
          loading={!ready}
          errmsg={errmsg}
          onExitComplete={() => {
            setLoadingOverlay(false);
          }}
        />
      )}
      <ErrorBoundary>
        <TooltipProvider>
          <FontFamilyListProvider fonts={fonts}>
            <StandaloneDocumentEditor editor={instance}>
              <div className="w-full h-full flex flex-row">
                <SidebarProvider className="w-full h-full">
                  <main className="w-full h-full select-none relative">
                    <WindowGlobalCurrentEditorProvider />
                    <UserCustomTemplatesProvider templates={templates}>
                      <Consumer backend={backend} canvasRef={handleCanvasRef} />
                    </UserCustomTemplatesProvider>
                  </main>
                </SidebarProvider>
              </div>
            </StandaloneDocumentEditor>
          </FontFamilyListProvider>
        </TooltipProvider>
      </ErrorBoundary>
    </>
  );
}

function Consumer({
  backend,
  canvasRef,
}: {
  backend: "dom" | "canvas";
  canvasRef?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const {
    ui,
    toggleVisibility,
    toggleMinimal,
    rightSidebarTab,
    setRightSidebarTab,
  } = useUILayout();
  const instance = useCurrentEditor();
  const debug = useEditorState(instance, (state) => state.debug);

  // Check if there are selected nodes for conditional sidebar display
  const hasSelection = useEditorState(
    instance,
    (state) => state.selection.length > 0
  );

  // Determine if right sidebar should be visible
  const should_show_sidebar_right =
    ui.sidebar_right === "visible" ||
    (ui.sidebar_right === "floating-when-selection" && hasSelection);

  // Determine the variant for the right sidebar
  const sidebar_right_variant =
    ui.sidebar_right === "floating-when-selection" ? "floating" : "sidebar";

  useHotkeys("meta+\\, ctrl+\\", (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    toggleVisibility();
  });

  useHotkeys("meta+shift+\\, ctrl+shift+\\", (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    toggleMinimal();
  });

  useHotkeys("ctrl+`", () => {
    const debug = instance.toggleDebug();
    toast("Debug mode " + (debug ? "enabled" : "disabled"), {
      position: "bottom-left",
    });
  });

  useHotkeys(
    "meta+s, ctrl+s",
    () => {
      onExport();
    },
    {
      preventDefault: true,
    }
  );

  const onExport = () => {
    const blob = instance.archive();
    saveAs(blob, distro.snapshot_file_name());
  };

  return (
    <AgentChatProvider>
      <PreviewProvider>
        <div className="flex w-full h-full">
          {ui.sidebar_left && (
            <SidebarLeft
              toggleVisibility={toggleVisibility}
              toggleMinimal={toggleMinimal}
            />
          )}
          <EditorSurfaceClipboardSyncProvider />
          <EditorSurfaceDropzone>
            <EditorSurfaceContextMenu>
              <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                <ViewportRoot className="relative w-full h-full overflow-hidden">
                  <Hotkyes />
                  <EditorSurface />
                  <LocalFakeCursorChat />
                  {/* {backend === "canvas" && (
                    <__WIP_UNSTABLE_WasmContent editor={instance} />
                  )} */}
                  {backend === "canvas" && <Canvas ref={canvasRef} />}
                  {backend === "dom" && (
                    <AutoInitialFitTransformer>
                      <StandaloneSceneContent />
                    </AutoInitialFitTransformer>
                  )}
                  {ui.toolbar_bottom && (
                    <>
                      <BrushToolbarPosition>
                        <BrushToolbar />
                      </BrushToolbarPosition>
                      <PathToolbarPosition>
                        <PathToolbar />
                      </PathToolbarPosition>
                      <ToolbarPosition>
                        <PlaygroundToolbar />
                      </ToolbarPosition>
                    </>
                  )}
                </ViewportRoot>
                {debug && <DevtoolsPanel />}
              </StandaloneSceneBackground>
            </EditorSurfaceContextMenu>
          </EditorSurfaceDropzone>
          {should_show_sidebar_right && (
            <SidebarRight
              variant={sidebar_right_variant}
              tab={rightSidebarTab}
              setTab={setRightSidebarTab}
            />
          )}
        </div>
      </PreviewProvider>

      {ui.help_fab && rightSidebarTab !== "agent" && (
        <HelpFab className="absolute right-4 bottom-4" />
      )}
      {/* <CommandPalette /> */}
    </AgentChatProvider>
  );
}

function Canvas({ ref }: { ref?: (canvas: HTMLCanvasElement | null) => void }) {
  const dpr = useDPR();

  return (
    <WithSize
      className="w-full h-full max-w-full max-h-full"
      style={{
        // Force the canvas to respect container boundaries
        contain: "strict",
      }}
    >
      {({ width, height }) => (
        <canvas
          id="canvas"
          ref={ref}
          width={width * dpr}
          height={height * dpr}
          style={{
            width: width,
            height: height,
          }}
        />
      )}
    </WithSize>
  );
}

/**
 * Local Fake Cusror portal
 *
 * This is only active when fake cursor is required when typing chat
 */
function LocalFakeCursorChat() {
  const instance = useCurrentEditor();

  // Get cursor chat state from editor
  const cursorChatState = useEditorState(
    instance,
    (state) => state.local_cursor_chat
  );

  useHotkeys("/", (e) => {
    e.preventDefault();
    instance.surface.openCursorChat();
  });

  const handleValueChange = (value: string) => {
    instance.surface.updateCursorChatMessage(value);
  };

  const handleValueCommit = (value: string) => {
    // Clear message after commit
    instance.surface.updateCursorChatMessage(null);
  };

  const handleClose = () => {
    instance.surface.closeCursorChat();
  };

  return (
    <CursorChat
      open={cursorChatState.is_open}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      onClose={handleClose}
    />
  );
}

function SidebarLeft({
  toggleVisibility,
  toggleMinimal,
}: {
  toggleVisibility?: () => void;
  toggleMinimal?: () => void;
}) {
  const libraryDialog = useDialogState("library");

  return (
    <aside className="relative">
      <div className="absolute top-4 -right-14 z-50">
        <Button
          variant={libraryDialog.open ? "default" : "outline"}
          className="size-8 rounded-full p-0"
          onClick={libraryDialog.openDialog}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
      {libraryDialog.open ? (
        <>
          <DialogPrimitive.Root {...libraryDialog.props}>
            <DialogPrimitive.Content className="h-full">
              <DialogPrimitive.Title className="sr-only">
                Library
              </DialogPrimitive.Title>
              <SidebarRoot>
                <LibraryContent />
              </SidebarRoot>
            </DialogPrimitive.Content>
          </DialogPrimitive.Root>
        </>
      ) : (
        <>
          <Sidebar>
            <SidebarHeader className="p-0">
              <DarwinSidebarHeaderDragArea />
              <header className="h-11 min-h-11 flex items-center px-4 border-b">
                <DropdownMenu>
                  <DropdownMenuTrigger className="me-2">
                    <GridaLogo className="inline-block size-4" />
                  </DropdownMenuTrigger>
                  <PlaygroundMenuContent
                    toggleVisibility={toggleVisibility}
                    toggleMinimal={toggleMinimal}
                  />
                </DropdownMenu>
                <span className="font-bold text-xs">
                  Canvas
                  <Badge variant="outline" className="ms-2 text-xs">
                    BETA
                  </Badge>
                </span>
              </header>
            </SidebarHeader>
            <SidebarContent className="p-0 overflow-hidden">
              <DocumentHierarchy />
            </SidebarContent>
          </Sidebar>
        </>
      )}
    </aside>
  );
}

function useArtboardListCondition() {
  const tool = useToolState();
  const { constraints } = useCurrentSceneState();
  const should_show_artboards_list =
    tool.type === "insert" &&
    tool.node === "container" &&
    constraints.children === "multiple";
  return should_show_artboards_list;
}

function PresenseAvatars() {
  const instance = useCurrentEditor();
  const cursors = useEditorState(instance, (state) => state.cursors);

  return (
    <div className="flex ms-0 -space-x-2 -mx-2">
      <PlayerAvatar
        type="local"
        colors={{
          ring: "",
          fill: "",
          text: "",
        }}
        zIndex={Object.keys(cursors).length + 1}
        avatar={{
          src: undefined,
          fallback: "ME",
        }}
      />
      {Object.values(cursors).map((cursor, i) => (
        <PlayerAvatar
          key={cursor.id}
          type={"remote"}
          colors={{
            ring: cursor.palette["400"],
            fill: cursor.palette["600"],
            text: cursor.palette["100"],
          }}
          zIndex={Object.keys(cursors).length - i}
          avatar={{
            src: undefined,
            fallback: "?",
          }}
          tooltip="Click to follow"
          onClick={() => {
            instance.surface.follow(cursor.id);
          }}
        />
      ))}
    </div>
  );
}

function SidebarRight({
  variant = "sidebar",
  tab,
  setTab,
}: {
  variant?: "sidebar" | "floating";
  tab: "inspect" | "agent";
  setTab: (tab: "inspect" | "agent") => void;
}) {
  const should_show_artboards_list = useArtboardListCondition();

  return (
    <aside
      data-variant={variant}
      id="sidebar-right"
      className="relative data-[variant=floating]:absolute data-[variant=floating]:right-0"
      style={
        {
          "--sidebar-width": tab === "inspect" ? "240px" : "400px",
        } as React.CSSProperties
      }
    >
      <Sidebar
        side="right"
        variant={variant}
        className="
          group-data-[variant=floating]:h-[700px]
          group-data-[variant=floating]:pt-8 group-data-[variant=floating]:pb-4 group-data-[variant=floating]:pl-0 group-data-[variant=floating]:pr-4
          relative
        "
      >
        <SidebarHeader className="p-0 gap-0">
          <header className="flex h-11 px-2 justify-between items-center gap-2">
            <div className="flex-1">
              <PresenseAvatars />
            </div>
            <div className="flex items-center">
              <Zoom
                className={cn(
                  WorkbenchUI.inputVariants({
                    variant: "input",
                    size: "xs",
                  }),
                  "w-auto"
                )}
              />
              <PreviewButton />
            </div>
          </header>
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "inspect" | "agent")}
          >
            <SidebarTabsList className="h-auto bg-transparent px-2 pb-2">
              <SidebarTabsTrigger value="inspect" size="xs">
                Inspect
              </SidebarTabsTrigger>
              <SidebarTabsTrigger value="agent" size="xs">
                Agent
              </SidebarTabsTrigger>
            </SidebarTabsList>
          </Tabs>
        </SidebarHeader>
        <hr />
        {should_show_artboards_list ? (
          <>
            <DialogPrimitive.Root open>
              <DialogPrimitive.Content className="h-full">
                <DialogPrimitive.Title className="sr-only">
                  Artboards
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Select an artboard to insert
                </DialogPrimitive.Description>
                <SidebarRoot>
                  <ArtboardsList />
                </SidebarRoot>
              </DialogPrimitive.Content>
            </DialogPrimitive.Root>
          </>
        ) : (
          <SidebarContent
            className={cn("gap-0", tab === "agent" && "overflow-hidden")}
          >
            <Tabs
              value={tab}
              className={cn(tab === "agent" && "flex flex-col h-full")}
            >
              <SidebarTabsContent value="inspect">
                <Selection
                  empty={
                    <div className="mt-4 mb-10">
                      <DocumentProperties />
                    </div>
                  }
                />
              </SidebarTabsContent>
              <SidebarTabsContent value="agent" className="min-h-0">
                <AgentPanel className="h-full flex-1 min-h-0" />
              </SidebarTabsContent>
            </Tabs>
          </SidebarContent>
        )}
      </Sidebar>
    </aside>
  );
}

function PathToolbarPosition({ children }: React.PropsWithChildren<{}>) {
  const cem = useContentEditModeMinimalState();

  if (cem?.type !== "vector" && cem?.type !== "width") return null;

  return (
    <div className="absolute bottom-24 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
      {children}
    </div>
  );
}

function BrushToolbarPosition({ children }: React.PropsWithChildren<{}>) {
  const tool = useToolState();

  if (!(tool.type === "brush" || tool.type === "eraser")) return null;

  return (
    <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="relative left-8">{children}</div>
    </div>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
