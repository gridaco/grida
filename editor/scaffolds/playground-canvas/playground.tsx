"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { SidebarRoot } from "@/components/sidebar";
import {
  Align,
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
} from "@/grida-canvas-react";
import {
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
import { useGoogleFontsList } from "@/grida-canvas-react/components/google-fonts";
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
import { useEditor } from "@/grida-canvas-react";
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

type UIConfig = {
  sidebar: "hidden" | "visible";
  toolbar: "hidden" | "visible";
};

const CANVAS_BG_COLOR = { r: 245, g: 245, b: 245, a: 1 };

function useSyncMultiplayerCursors(editor: Editor) {
  const pluginRef = useRef<EditorYSyncPlugin | null>(null);

  useEffect(() => {
    if (!pluginRef.current) {
      pluginRef.current = new EditorYSyncPlugin(editor, "grida-canvas-demo", {
        palette: colors[randomcolorname({ exclude: neutral_colors })],
      });
    }

    return () => {
      if (pluginRef.current) {
        pluginRef.current.destroy();
        pluginRef.current = null;
      }
    };
  }, [editor]);
}

export type CanvasPlaygroundProps = {
  src?: string;
  document?: editor.state.IEditorStateInit;
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
  templates,
  src,
}: CanvasPlaygroundProps) {
  const instance = useEditor(editor.state.init(document));
  useSyncMultiplayerCursors(instance);
  const fonts = useGoogleFontsList();

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
                    <Consumer />
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

function Consumer() {
  const [ui, setUI] = useState<UIConfig>({
    sidebar: "visible",
    toolbar: "visible",
  });

  const instance = useCurrentEditor();
  const debug = useEditorState(instance, (state) => state.debug);

  useDisableSwipeBack();

  useHotkeys("meta+\\, ctrl+\\", () => {
    setUI((ui) => ({
      ...ui,
      sidebar: ui.sidebar === "visible" ? "hidden" : "visible",
    }));
  });

  useHotkeys("ctrl+`", () => {
    const debug = instance.toggleDebug();
    toast("Debug mode " + (debug ? "enabled" : "disabled"), {
      position: "bottom-left",
    });
  });

  useHotkeys("meta+shift+\\, ctrl+shift+\\", () => {
    setUI((ui) => ({
      ...ui,
      toolbar: ui.toolbar === "visible" ? "hidden" : "visible",
    }));
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
    saveAs(blob, `${v4()}.grida`);
  };

  return (
    <>
      <PreviewProvider>
        <div className="flex w-full h-full">
          {ui.sidebar === "visible" && <SidebarLeft />}
          <EditorSurfaceClipboardSyncProvider>
            <EditorSurfaceDropzone>
              <EditorSurfaceContextMenu>
                <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                  <ViewportRoot className="relative w-full h-full overflow-hidden">
                    <Hotkyes />
                    <EditorSurface />
                    <AutoInitialFitTransformer>
                      <StandaloneSceneContent />
                    </AutoInitialFitTransformer>
                    {ui.toolbar === "visible" && (
                      <>
                        <BrushToolbarPosition>
                          <BrushToolbar />
                        </BrushToolbarPosition>
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
          {ui.sidebar === "visible" && (
            <aside className="h-full">
              <SidebarRight />
            </aside>
          )}
        </div>
      </PreviewProvider>

      {ui.toolbar === "visible" && <HelpFab />}
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
  const { tool } = useToolState();
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
        />
      ))}
    </div>
  );
}

function SidebarRight() {
  const should_show_artboards_list = useArtboardListCondition();

  return (
    <SidebarRoot side="right" className="hidden sm:block">
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
        <>
          <Align />
          <hr />
          <Selection
            empty={
              <div className="mt-4 mb-10">
                <DocumentProperties />
              </div>
            }
          />
        </>
      )}
    </SidebarRoot>
  );
}

function BrushToolbarPosition({ children }: React.PropsWithChildren<{}>) {
  const { tool } = useToolState();

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
            <div className="py-4 divide-y-2">
              <Label className="flex items-center justify-between">
                Debug Mode
                <Switch
                  checked={editor.debug}
                  onCheckedChange={(v) => {
                    editor.debug = v;
                  }}
                />
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
    saveAs(blob, `${v4()}.grida`);
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
