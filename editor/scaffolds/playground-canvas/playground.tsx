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
import { WindowCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import { LibraryContent } from "./library";
import { EditorYSyncPlugin } from "@/grida-canvas/plugins/sync-y";
import { Editor } from "@/grida-canvas/editor";
import { PlayerAvatar } from "@/components/multiplayer/avatar";
import colors, {
  neutral_colors,
  randomcolorname,
} from "@/theme/tailwindcolors";
import { __WIP_UNSTABLE_WasmContent } from "@/grida-canvas-react/renderer";
import { PathToolbar } from "@/grida-canvas-react-starter-kit/starterkit-toolbar/path-toolbar";

type UILayoutVariant = "full" | "minimal" | "hidden";
type UILayout = {
  sidebar_left: boolean;
  sidebar_right: "hidden" | "visible" | "floating-when-selection";
  toolbar_bottom: boolean;
  help_fab: boolean;
};

const CANVAS_BG_COLOR = { r: 245, g: 245, b: 245, a: 1 };

const LAYOUT_VARIANTS: Record<UILayoutVariant, UILayout> = {
  hidden: {
    sidebar_left: false,
    sidebar_right: "hidden",
    toolbar_bottom: false,
    help_fab: false,
  },
  minimal: {
    sidebar_left: false,
    sidebar_right: "floating-when-selection",
    toolbar_bottom: true,
    help_fab: true,
  },
  full: {
    sidebar_left: true,
    sidebar_right: "visible",
    toolbar_bottom: true,
    help_fab: true,
  },
};

// Custom hook for managing UI layout state
function useUILayout() {
  const [uiVariant, setUIVariant] = useState<UILayoutVariant>("full");
  const [lastVisibleVariant, setLastVisibleVariant] = useState<
    "full" | "minimal"
  >("full");

  const ui = useMemo(() => LAYOUT_VARIANTS[uiVariant], [uiVariant]);

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

function snapshotFilename() {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toLocaleTimeString().replace(/:/g, ".");
  return `Snapshot ${date} at ${time}.grida`;
}

function useSyncMultiplayerCursors(editor: Editor, room_id?: string) {
  const pluginRef = useRef<EditorYSyncPlugin | null>(null);

  useEffect(() => {
    if (!room_id) return;

    if (!pluginRef.current) {
      pluginRef.current = new EditorYSyncPlugin(editor, room_id, {
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
  document = {
    editable: true,
    debug: false,
    document: {
      nodes: {},
      scenes: {
        main: {
          type: "scene",
          id: "main",
          name: "main",
          children: [],
          guides: [],
          constraints: {
            children: "multiple",
          },
          backgroundColor: CANVAS_BG_COLOR,
        },
      },
    },
  },
  backend = "dom",
  templates,
  src,
  room_id,
}: CanvasPlaygroundProps) {
  const instance = useEditor(document, backend);
  useSyncMultiplayerCursors(instance, room_id);
  const fonts = useEditorState(instance, (state) => state.webfontlist.items);

  useEffect(() => {
    if (!src) return;
    fetch(src).then((res) => {
      res.json().then((file) => {
        instance.reset(
          editor.state.init({
            editable: true,
            document: file.document,
          }),
          src
        );
      });
    });
  }, [src]);

  return (
    <>
      <FontFamilyListProvider fonts={fonts}>
        <SidebarProvider className="w-full h-full">
          <TooltipProvider>
            <main className="w-full h-full select-none">
              <ErrorBoundary>
                <StandaloneDocumentEditor editor={instance}>
                  <WindowCurrentEditorProvider />
                  <UserCustomTemplatesProvider templates={templates}>
                    <Consumer backend={backend} />
                  </UserCustomTemplatesProvider>
                </StandaloneDocumentEditor>
              </ErrorBoundary>
            </main>
          </TooltipProvider>
        </SidebarProvider>
      </FontFamilyListProvider>
    </>
  );
}

function Consumer({ backend }: { backend: "dom" | "canvas" }) {
  const { ui, toggleVisibility, toggleMinimal } = useUILayout();

  const instance = useCurrentEditor();
  const debug = useEditorState(instance, (state) => state.debug);

  // Check if there are selected nodes for conditional sidebar display
  const hasSelection = useEditorState(
    instance,
    (state) => state.selection.length > 0
  );

  // Determine if right sidebar should be visible
  const showSidebarRight =
    ui.sidebar_right === "visible" ||
    (ui.sidebar_right === "floating-when-selection" && hasSelection);

  // Determine the variant for the right sidebar
  const sidebarRightVariant =
    ui.sidebar_right === "floating-when-selection" ? "floating" : "sidebar";

  useDisableSwipeBack();

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
    saveAs(blob, snapshotFilename());
  };

  return (
    <>
      <PreviewProvider>
        <div className="flex w-full h-full">
          {ui.sidebar_left && <SidebarLeft />}
          <EditorSurfaceClipboardSyncProvider>
            <EditorSurfaceDropzone>
              <EditorSurfaceContextMenu>
                <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                  <ViewportRoot className="relative w-full h-full overflow-hidden">
                    <Hotkyes />
                    <EditorSurface />
                    {backend === "canvas" ? (
                      <__WIP_UNSTABLE_WasmContent editor={instance} />
                    ) : (
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
          </EditorSurfaceClipboardSyncProvider>
          {showSidebarRight && <SidebarRight variant={sidebarRightVariant} />}
        </div>
      </PreviewProvider>

      {ui.help_fab && <HelpFab />}
    </>
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

function Presense() {
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
        zIndex={cursors.length + 1}
        avatar={{
          src: undefined,
          fallback: "ME",
        }}
      />
      {cursors.map((cursor, i) => (
        <PlayerAvatar
          key={cursor.id}
          type={"remote"}
          colors={{
            ring: cursor.palette["400"],
            fill: cursor.palette["600"],
            text: cursor.palette["100"],
          }}
          zIndex={cursors.length - i}
          avatar={{
            src: undefined,
            fallback: "?",
          }}
          tooltip="Click to follow"
          onClick={() => {
            instance.follow(cursor.id);
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
    <aside className="relative">
      <Sidebar
        side="right"
        variant={variant}
        className="hidden sm:block group-data-[variant=floating]:pt-8 group-data-[variant=floating]:pb-4 group-data-[variant=floating]:pl-0 group-data-[variant=floating]:pr-4"
      >
        <SidebarHeader className="p-0">
          <header className="flex h-11 px-2 justify-between items-center gap-2">
            <div className="flex-1">
              <Presense />
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
                <Link href="/canvas" target="_blank">
                  <Button size="sm" variant="outline">
                    DOM
                    <OpenInNewWindowIcon />
                  </Button>
                </Link>
              </Label>
              <Label className="flex items-center justify-between">
                Rendering Backend
                <Link href="/canvas/experimental/wasm" target="_blank">
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
    saveAs(blob, snapshotFilename());
  };

  return (
    <>
      <ImportFromGridaFileJsonDialog
        key={importFromJson.refreshkey}
        {...importFromJson.props}
        onImport={(file) => {
          instance.reset(
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
