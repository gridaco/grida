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
import {
  ScenesGroup,
  NodeHierarchyGroup,
} from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";
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
import {
  DownloadIcon,
  FigmaLogoIcon,
  FileIcon,
  GearIcon,
  GitHubLogoIcon,
  MixIcon,
  OpenInNewWindowIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PlaygroundToolbar } from "./toolbar";
import Link from "next/link";
import { ThemedMonacoEditor } from "@/components/monaco";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalStorage } from "@uidotdev/usehooks";
import { CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY } from "./k";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import {
  keybindings_sheet,
  useEditorHotKeys,
} from "@/grida-canvas-react/viewport/hotkeys";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./error-boundary";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { keysymbols } from "@/grida-canvas-react/devtools/keysymbols";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import { SlackIcon } from "lucide-react";
import BrushToolbar from "@/grida-canvas-react-starter-kit/starterkit-toolbar/brush-toolbar";
import ArtboardsList from "@/grida-canvas-react-starter-kit/starterkit-artboard-list";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  PreviewButton,
  PreviewProvider,
} from "@/grida-canvas-react-starter-kit/starterkit-preview";
import {
  ImportFromFigmaDialog,
  ImportFromGridaFileJsonDialog,
} from "@/grida-canvas-react-starter-kit/starterkit-import";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { canvas_examples } from "./examples";
import { DarwinSidebarHeaderDragArea } from "../../host/desktop";
import { sitemap } from "@/www/data/sitemap";
import iofigma from "@grida/io-figma";
import { editor } from "@/grida-canvas";
import useDisableSwipeBack from "@/grida-canvas-react/viewport/hooks/use-disable-browser-swipe-back";
import { WindowGlobalCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import { LibraryContent } from "./library";
import { EditorYSyncPlugin } from "@/grida-canvas/plugins/sync-y";
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

// Custom hook for managing UI layout state
function useUILayout() {
  const [uiVariant, setUIVariant] = useState<distro.ui.UILayoutVariant>("full");
  const [lastVisibleVariant, setLastVisibleVariant] = useState<
    "full" | "minimal"
  >("full");

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
    toggleVisibility,
    toggleMinimal,
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
  useDisableSwipeBack();
  const instance = useEditor(document, backend);
  useSyncMultiplayerCursors(instance, room_id);
  const fonts = useEditorState(instance, (state) => state.webfontlist.items);
  const [documentReady, setDocumentReady] = useState(() => !src);
  const [canvasReady, setCanvasReady] = useState(() => backend !== "canvas");
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );
  const [errmsg, setErrmsg] = useState<string | null>(null);
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
      <ErrorBoundary>
        <SidebarProvider className="w-full h-full">
          <TooltipProvider>
            <FullscreenLoadingOverlay loading={!ready} errmsg={errmsg} />
            <main className="w-full h-full select-none">
              <FontFamilyListProvider fonts={fonts}>
                <StandaloneDocumentEditor editor={instance}>
                  <WindowGlobalCurrentEditorProvider />
                  <UserCustomTemplatesProvider templates={templates}>
                    <Consumer backend={backend} canvasRef={handleCanvasRef} />
                  </UserCustomTemplatesProvider>
                </StandaloneDocumentEditor>
              </FontFamilyListProvider>
            </main>
          </TooltipProvider>
        </SidebarProvider>
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
  const { ui, toggleVisibility, toggleMinimal } = useUILayout();
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
    <>
      <PreviewProvider>
        <div className="flex w-full h-full">
          {ui.sidebar_left && <SidebarLeft />}
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
            <SidebarRight variant={sidebar_right_variant} />
          )}
        </div>
      </PreviewProvider>

      {ui.help_fab && <HelpFab />}
    </>
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

function SidebarLeft() {
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
                  <PlaygroundMenuContent />
                </DropdownMenu>
                <span className="font-bold text-xs">
                  Canvas
                  <Badge variant="outline" className="ms-2 text-xs">
                    BETA
                  </Badge>
                </span>
              </header>
            </SidebarHeader>
            <SidebarContent>
              <ScenesGroup />
              <hr />
              <NodeHierarchyGroup />
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
}: {
  variant?: "sidebar" | "floating";
}) {
  const should_show_artboards_list = useArtboardListCondition();

  return (
    <aside
      data-variant={variant}
      id="sidebar-right"
      className="relative data-[variant=floating]:absolute"
    >
      <Sidebar
        side="right"
        variant={variant}
        className="group-data-[variant=floating]:pt-8 group-data-[variant=floating]:pb-4 group-data-[variant=floating]:pl-0 group-data-[variant=floating]:pr-4"
      >
        <SidebarHeader className="p-0">
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
          <SidebarContent className="gap-0">
            <Selection
              empty={
                <div className="mt-4 mb-10">
                  <DocumentProperties />
                </div>
              }
            />
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

function SettingsDialog(props: React.ComponentProps<typeof Dialog>) {
  const editor = useCurrentEditor();
  const [aiSettings, setAiSettings] = useLocalStorage<string | undefined>(
    CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY,
    undefined
  );

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Playground Settings</DialogTitle>
        </DialogHeader>
        <hr />
        <Tabs defaultValue="keybindings" className="min-h-96">
          <TabsList>
            <TabsTrigger value="keybindings">Keyboard Shortcuts</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <div className="py-4 space-y-2">
              <Label className="flex items-center justify-between">
                Debug Mode
                <Switch
                  checked={editor.debug}
                  onCheckedChange={(v) => {
                    editor.debug = v;
                  }}
                />
              </Label>
              <hr />
              <Label className="flex items-center justify-between">
                Rendering Backend
                <Link href="/canvas/experimental/dom" target="_blank">
                  <Button size="sm" variant="outline">
                    DOM
                    <OpenInNewWindowIcon />
                  </Button>
                </Link>
              </Label>
              <Label className="flex items-center justify-between">
                Rendering Backend
                <Link href="/canvas" target="_blank">
                  <Button size="sm" variant="outline">
                    CANVAS WASM
                    <OpenInNewWindowIcon />
                  </Button>
                </Link>
              </Label>

              {/* <label>
                Snap to geometry
                <Switch />
              </label>
              <label>
                Snap to objects
                <Switch />
              </label>
              <label>
                Snap to pixel grid
                <Switch />
              </label> */}
              {/* <label>Nudge Amount</label> */}
            </div>
          </TabsContent>
          <TabsContent value="keybindings">
            <ScrollArea className="h-96">
              <ScrollBar />
              <div>
                {keybindings_sheet.map((action) => {
                  return (
                    <div
                      key={action.name}
                      className="flex items-center justify-between p-2 border-b last:border-b-0"
                    >
                      <div className="grid gap-1">
                        <span className="font-medium text-sm text-gray-800">
                          {action.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {action.description}
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        {action.keys.map((key) => (
                          <span
                            key={key}
                            className="px-2 py-1 text-xs font-mono font-bold text-gray-700 bg-gray-200 rounded-md shadow"
                          >
                            {key
                              .split("+")
                              .map(
                                (part) =>
                                  keysymbols[part.toLowerCase()] ||
                                  part.toUpperCase()
                              )
                              .join(" + ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="ai">
            <div>
              <ThemedMonacoEditor
                value={aiSettings}
                onChange={setAiSettings}
                width="100%"
                height={400}
                language="txt"
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PlaygroundMenuContent() {
  const instance = useCurrentEditor();
  const importFromFigmaDialog = useDialogState("import-from-figma");
  const importFromJson = useDialogState("import-from-json", {
    refreshkey: true,
  });
  const settingsDialog = useDialogState("settings");

  const onExport = () => {
    const blob = instance.archive();
    saveAs(blob, distro.snapshot_file_name());
  };

  return (
    <>
      <ImportFromGridaFileJsonDialog
        key={importFromJson.refreshkey}
        {...importFromJson.props}
        onImport={(file) => {
          instance.commands.reset(
            editor.state.init({
              editable: true,
              document: file.document,
            }),
            Date.now() + ""
          );
        }}
      />

      <ImportFromFigmaDialog
        {...importFromFigmaDialog.props}
        onImport={(res) => {
          instance.insert({
            document: iofigma.restful.factory.document(
              res.document as any,
              res.images,
              {
                gradient_id_generator: () => v4(),
              }
            ),
          });
        }}
      />

      <SettingsDialog {...settingsDialog.props} />

      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuItem
          onClick={importFromJson.openDialog}
          className="text-xs"
        >
          <FileIcon className="size-3.5" />
          Open .grida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport} className="text-xs">
          <DownloadIcon className="size-3.5" />
          Save as .grida
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={importFromFigmaDialog.openDialog}
          className="text-xs"
        >
          <FigmaLogoIcon className="size-3.5" />
          Import Figma
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={settingsDialog.openDialog}
          className="text-xs"
        >
          <GearIcon className="size-3.5" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <OpenInNewWindowIcon className="size-3.5 me-2" />
            Tools
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <Link href="/canvas/tools/ai" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                AI
              </DropdownMenuItem>
            </Link>
            <Link href="/canvas/tools/io-figma" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                IO Figma
              </DropdownMenuItem>
            </Link>
            <Link href="/canvas/tools/io-svg" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                IO SVG
              </DropdownMenuItem>
            </Link>
            <Link href="https://github.com/gridaco/p666" target="_blank">
              <DropdownMenuItem className="text-xs">
                <OpenInNewWindowIcon className="size-3.5" />
                P666 Daemon
              </DropdownMenuItem>
            </Link>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <MixIcon className="size-3.5 me-2" />
            Examples
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {canvas_examples.map((example) => (
              <Link
                key={example.id}
                href={"/canvas/examples/" + example.id}
                target="_blank"
              >
                <DropdownMenuItem className="text-xs">
                  <OpenInNewWindowIcon className="size-3.5" />
                  {example.name}
                </DropdownMenuItem>
              </Link>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <Link href={sitemap.links.github} target="_blank">
          <DropdownMenuItem className="text-xs">
            <GitHubLogoIcon className="size-3.5" />
            GitHub
          </DropdownMenuItem>
        </Link>
        <Link href={sitemap.links.slack} target="_blank">
          <DropdownMenuItem className="text-xs">
            <SlackIcon className="size-3.5" />
            Slack Community
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </>
  );
}
