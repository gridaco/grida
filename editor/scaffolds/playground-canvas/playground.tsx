"use client";

import React, { useEffect, useMemo, useReducer, useState } from "react";
import {
  SidebarMenuGrid,
  SidebarMenuGridItem,
  SidebarRoot,
  SidebarVirtualizedMenuGrid,
} from "@/components/sidebar";
import {
  Align,
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { DocumentProperties } from "@/scaffolds/sidecontrol/sidecontrol-document-properties";
import {
  NodeHierarchyGroup,
  ScenesGroup,
} from "@/scaffolds/sidebar/sidebar-node-hierarchy-list";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
  standaloneDocumentReducer,
  initDocumentEditorState,
  useDocument,
  type IDocumentEditorInit,
} from "@/grida-react-canvas";
import { GridaLogo } from "@/components/grida-logo";
import { DevtoolsPanel } from "@/grida-react-canvas/devtools";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import {
  ButtonIcon,
  DownloadIcon,
  FigmaLogoIcon,
  FileIcon,
  GearIcon,
  GitHubLogoIcon,
  MixIcon,
  OpenInNewWindowIcon,
  PlayIcon,
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
import { ImportFromFigmaDialog } from "@/scaffolds/playground-canvas/modals/import-from-figma";
import { iofigma } from "@/grida-io-figma";
import { saveAs } from "file-saver";
import { ImportFromGridaFileJsonDialog } from "@/scaffolds/playground-canvas/modals/import-from-grida-file";
import { v4 } from "uuid";
import { HelpFab } from "@/scaffolds/help/editor-help-fab";
import { Badge } from "@/components/ui/badge";
import { PlaygroundToolbar } from "./toolbar";
import Link from "next/link";
import { ThemedMonacoEditor } from "@/components/monaco";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalStorage } from "@uidotdev/usehooks";
import { CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY } from "./k";
import { prototypes } from "./widgets";
import { useHotkeys } from "react-hotkeys-hook";
import toast from "react-hot-toast";
import {
  keybindings_sheet,
  useEditorHotKeys,
} from "@/grida-react-canvas/viewport/hotkeys";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./error-boundary";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { keysymbols } from "@/grida-react-canvas/devtools/keysymbols";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useGoogleFontsList } from "@/grida-fonts/react/hooks";
import { iosvg } from "@/grida-io-svg";
import { EditorSurfaceDropzone } from "@/grida-react-canvas/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-react-canvas/viewport/surface";
import { datatransfer } from "@/grida-react-canvas/viewport/data-transfer";
import useDisableSwipeBack from "@/grida-react-canvas/viewport/hooks/use-disable-browser-swipe-back";
import {
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
  StandaloneDocumentContentProps,
  UserCustomTemplatesProvider,
  UserCustomTemplatesProps,
} from "@/grida-react-canvas/renderer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import { SlackIcon } from "lucide-react";
import BrushToolbar from "@/grida-react-canvas-starter-kit/starterkit-toolbar/brush-toolbar";
import { io } from "@/grida-io-model";
import { canvas_examples } from "../playground/k";
import ArtboardsList from "@/grida-react-canvas-starter-kit/starterkit-artboard-list";
import { DarwinSidebarHeaderDragArea } from "../desktop";
import { ToolbarPosition } from "@/grida-react-canvas-starter-kit/starterkit-toolbar";
import {
  PreviewButton,
  PreviewProvider,
} from "@/grida-react-canvas-starter-kit/starterkit-preview";

type UIConfig = {
  sidebar: "hidden" | "visible";
  toolbar: "hidden" | "visible";
};

const CANVAS_BG_COLOR = { r: 245, g: 245, b: 245, a: 1 };

export type CanvasPlaygroundProps = {
  src?: string;
  document?: IDocumentEditorInit;
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
  useDisableSwipeBack();

  const [pref, setPref] = useState<Preferences>({ debug: false });
  const [ui, setUI] = useState<UIConfig>({
    sidebar: "visible",
    toolbar: "visible",
  });

  const libraryDialog = useDialogState("library");
  const settingsDialog = useDialogState("settings");
  const importFromFigmaDialog = useDialogState("import-from-figma");
  const importFromJson = useDialogState("import-from-json", {
    refreshkey: true,
  });
  const fonts = useGoogleFontsList();
  const [state, dispatch] = useReducer(
    standaloneDocumentReducer,
    initDocumentEditorState(document)
  );

  useHotkeys("meta+\\, ctrl+\\", () => {
    setUI((ui) => ({
      ...ui,
      sidebar: ui.sidebar === "visible" ? "hidden" : "visible",
    }));
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

  useEffect(() => {
    if (!src) return;
    fetch(src).then((res) => {
      res.json().then((file) => {
        dispatch({
          type: "__internal/reset",
          key: src,
          state: initDocumentEditorState({
            editable: true,
            document: file.document,
          }),
        });
      });
    });
  }, [src]);

  const onExport = () => {
    const documentData = {
      version: "0.0.1-beta.1+20250303",
      document: state.document,
    } satisfies io.JSONDocumentFileModel;

    const blob = new Blob([io.archive.pack(documentData)], {
      type: "application/zip",
    });

    saveAs(blob, `${v4()}.grida`);
  };

  return (
    <SidebarProvider className="w-full h-full">
      <TooltipProvider>
        <main className="w-full h-full select-none">
          <SettingsDialog
            {...settingsDialog.props}
            preferences={pref}
            onPreferencesChange={setPref}
          />
          <ImportFromGridaFileJsonDialog
            key={importFromJson.refreshkey}
            {...importFromJson.props}
            onImport={(file) => {
              dispatch({
                type: "__internal/reset",
                state: initDocumentEditorState({
                  editable: true,
                  document: file.document,
                }),
              });
            }}
          />
          <ImportFromFigmaDialog
            {...importFromFigmaDialog.props}
            onImport={(res) => {
              dispatch({
                type: "insert",
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
          <ErrorBoundary>
            <StandaloneDocumentEditor
              editable
              debug={pref.debug}
              initial={state}
              dispatch={dispatch}
            >
              <UserCustomTemplatesProvider templates={templates}>
                <PreviewProvider>
                  <Hotkyes />
                  <div className="flex w-full h-full">
                    {ui.sidebar === "visible" && (
                      <aside>
                        {libraryDialog.open ? (
                          <>
                            <DialogPrimitive.Root {...libraryDialog.props}>
                              <DialogPrimitive.Content className="h-full">
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
                                      <GridaLogo className="inline-block w-4 h-4" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="start"
                                      className="min-w-52"
                                    >
                                      <DropdownMenuItem
                                        onClick={importFromJson.openDialog}
                                        className="text-xs"
                                      >
                                        <FileIcon className="w-3.5 h-3.5 me-2 inline-block" />
                                        Open .grida
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={onExport}
                                        className="text-xs"
                                      >
                                        <DownloadIcon className="w-3.5 h-3.5 me-2 inline-block" />
                                        Save as .grida
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={
                                          importFromFigmaDialog.openDialog
                                        }
                                        className="text-xs"
                                      >
                                        <FigmaLogoIcon className="w-3.5 h-3.5 me-2 inline-block" />
                                        Import Figma
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={settingsDialog.openDialog}
                                        className="text-xs"
                                      >
                                        <GearIcon className="me-2" />
                                        Settings
                                      </DropdownMenuItem>

                                      <DropdownMenuSeparator />
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger className="text-xs">
                                          <OpenInNewWindowIcon className="me-2" />
                                          Tools
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          <Link
                                            href="/canvas/tools/io-figma"
                                            target="_blank"
                                          >
                                            <DropdownMenuItem className="text-xs">
                                              <OpenInNewWindowIcon className="me-2" />
                                              IO Figma
                                            </DropdownMenuItem>
                                          </Link>
                                          <Link
                                            href="/canvas/tools/io-svg"
                                            target="_blank"
                                          >
                                            <DropdownMenuItem className="text-xs">
                                              <OpenInNewWindowIcon className="me-2" />
                                              IO SVG
                                            </DropdownMenuItem>
                                          </Link>
                                          <Link
                                            href="https://github.com/gridaco/p666"
                                            target="_blank"
                                          >
                                            <DropdownMenuItem className="text-xs">
                                              <OpenInNewWindowIcon className="me-2" />
                                              P666 Daemon
                                            </DropdownMenuItem>
                                          </Link>
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger className="text-xs">
                                          <MixIcon className="me-2" />
                                          Examples
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          {canvas_examples.map((example) => (
                                            <Link
                                              key={example.id}
                                              href={
                                                "/canvas/examples/" + example.id
                                              }
                                              target="_blank"
                                            >
                                              <DropdownMenuItem className="text-xs">
                                                <OpenInNewWindowIcon className="me-2" />
                                                {example.name}
                                              </DropdownMenuItem>
                                            </Link>
                                          ))}
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                      <DropdownMenuSeparator />
                                      <Link
                                        href="https://github.com/gridaco/grida"
                                        target="_blank"
                                      >
                                        <DropdownMenuItem className="text-xs">
                                          <GitHubLogoIcon className="me-2" />
                                          GitHub
                                        </DropdownMenuItem>
                                      </Link>
                                      <Link
                                        href="https://grida.co/join-slack"
                                        target="_blank"
                                      >
                                        <DropdownMenuItem className="text-xs">
                                          <SlackIcon className="me-2 w-4 h-4" />
                                          Slack Community
                                        </DropdownMenuItem>
                                      </Link>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  <span className="font-bold text-xs">
                                    Canvas
                                    <Badge
                                      variant="outline"
                                      className="ms-2 text-xs"
                                    >
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
                    )}
                    <EditorSurfaceClipboardSyncProvider>
                      <EditorSurfaceDropzone>
                        <EditorSurfaceContextMenu>
                          <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                            <ViewportRoot className="relative w-full h-full overflow-hidden">
                              <EditorSurface />
                              <AutoInitialFitTransformer>
                                <StandaloneSceneContent />
                              </AutoInitialFitTransformer>

                              {ui.sidebar === "visible" && (
                                <>
                                  <div className="absolute top-4 left-4 z-50">
                                    <Button
                                      variant={
                                        libraryDialog.open
                                          ? "default"
                                          : "outline"
                                      }
                                      className="w-8 h-8 rounded-full p-0"
                                      onClick={libraryDialog.openDialog}
                                    >
                                      <PlusIcon className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </>
                              )}
                              {ui.toolbar === "visible" && (
                                <>
                                  <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center z-50 pointer-events-none">
                                    <div className="relative left-8">
                                      <BrushToolbar />
                                    </div>
                                  </div>
                                  <ToolbarPosition>
                                    <PlaygroundToolbar
                                      onAddButtonClick={
                                        libraryDialog.openDialog
                                      }
                                    />
                                  </ToolbarPosition>
                                </>
                              )}
                            </ViewportRoot>
                            {pref.debug && <DevtoolsPanel />}
                          </StandaloneSceneBackground>
                        </EditorSurfaceContextMenu>
                      </EditorSurfaceDropzone>
                    </EditorSurfaceClipboardSyncProvider>
                    {ui.sidebar === "visible" && (
                      <aside className="h-full">
                        <SidebarRoot side="right" className="hidden sm:block">
                          <header className="h-11 flex items-center px-2 justify-end gap-2">
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
                          </header>
                          <hr />
                          <FontFamilyListProvider fonts={fonts}>
                            {state.tool.type === "insert" &&
                            state.tool.node === "container" &&
                            state.document.scenes[state.scene_id!].constraints
                              .children === "multiple" ? (
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
                          </FontFamilyListProvider>
                        </SidebarRoot>
                      </aside>
                    )}
                  </div>
                </PreviewProvider>
              </UserCustomTemplatesProvider>
            </StandaloneDocumentEditor>
          </ErrorBoundary>
          {ui.toolbar === "visible" && <HelpFab />}
        </main>
      </TooltipProvider>
    </SidebarProvider>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}

type Preferences = {
  debug: boolean;
};

function SettingsDialog(
  props: React.ComponentProps<typeof Dialog> & {
    preferences: Preferences;
    onPreferencesChange: (preferences: Preferences) => void;
  }
) {
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
                  checked={props.preferences.debug}
                  onCheckedChange={(v) => {
                    props.onPreferencesChange({
                      ...props.preferences,
                      debug: v,
                    });
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

const widgets = [
  "text",
  "rich text",
  "note",
  "image",
  "video",
  "icon",
  "embed",
  "column",
  "row",
  "cards",
  "button",
  "avatar",
  "badge",
  "separator",
];

function LibraryContent() {
  const { insertNode } = useDocument();

  const icons_data = useReflectIconsData();
  const icons = useMemo(() => {
    return (
      Object.keys(icons_data).map((key) => {
        const icondata = icons_data[key];
        const src = reflect_icon_link(icondata);
        return { ...icondata, src, key } satisfies ReflectUIIconData & {
          src: string;
          key: string;
        };
      }) as (ReflectUIIconData & { src: string; key: string })[]
    ).filter((icon) => icon.host === "material");
  }, [icons_data]);

  const shapes = useGridaStdShapes();

  const onInsertWidget = (type: string) => {
    const pre = (prototypes as any)[type];
    if (!pre) {
      toast.error("Widget not found");
      return;
    }

    // insert widget tree
    insertNode(pre);
  };

  const onInsertSvgSrc = (name: string, src: string) => {
    const task = fetch(src, {
      cache: "no-store",
    }).then((res) => {
      // svg content
      res.text().then((svg) => {
        const optimized = iosvg.v0.optimize(svg).data;
        iosvg.v0
          .convert(optimized, {
            name: name.split(".svg")[0],
            currentColor: { r: 0, g: 0, b: 0, a: 1 },
          })
          .then((result) => {
            if (result) {
              insertNode(result);
            } else {
              throw new Error("Failed to convert SVG");
            }
          });
      });
    });

    toast.promise(task, {
      loading: "Loading...",
      success: "Inserted",
      error: "Failed to insert SVG",
    });
  };

  const [tab, setTab] = useLocalStorage(
    "playground-insert-dialog-tab",
    "widgets"
  );

  return (
    <>
      <Tabs className="mx-2 my-4 h-full" value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="widgets">Widgets</TabsTrigger>
          <TabsTrigger value="shapes">Shapes</TabsTrigger>
          <TabsTrigger value="icons">Icons</TabsTrigger>
        </TabsList>
        <TabsContent value="widgets" className="h-full overflow-y-scroll">
          <SidebarMenuGrid>
            {widgets.map((type) => {
              return (
                <HoverCard key={type} openDelay={100} closeDelay={100}>
                  {/*  */}
                  <HoverCardTrigger>
                    <SidebarMenuGridItem
                      draggable
                      onClick={() => {
                        onInsertWidget(type);
                      }}
                      className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground"
                    >
                      {/* <BlockTypeIcon
                  type={block_type}
                  className="p-2 w-8 h-8 rounded"
                /> */}
                      <ButtonIcon />
                      <div className="mt-1 w-full text-xs break-words text-center overflow-hidden text-ellipsis">
                        {type}
                      </div>
                    </SidebarMenuGridItem>
                  </HoverCardTrigger>
                </HoverCard>
              );
            })}
          </SidebarMenuGrid>
        </TabsContent>
        <TabsContent value="shapes" className="h-full overflow-y-scroll">
          <SidebarMenuGrid>
            {/*  */}
            {shapes.map((item) => {
              const { name, src } = item;
              return (
                <SidebarMenuGridItem
                  key={name}
                  onClick={() => onInsertSvgSrc(name, src)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      datatransfer.key,
                      datatransfer.encode({
                        type: "svg",
                        name: name,
                        src: src,
                      })
                    );
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={name}
                    loading="lazy"
                    className="w-10 h-auto dark:invert"
                  />
                </SidebarMenuGridItem>
              );
            })}
          </SidebarMenuGrid>
        </TabsContent>
        <TabsContent value="icons" className="w-full h-full">
          <SidebarVirtualizedMenuGrid
            columnWidth={70}
            rowHeight={70}
            className="min-h-96"
            gap={4}
            renderItem={({ item }) => {
              const { src, family } = item;
              return (
                <SidebarMenuGridItem
                  onClick={() => onInsertSvgSrc(family, src)}
                  className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      datatransfer.key,
                      datatransfer.encode({
                        type: "svg",
                        name: family,
                        src: src,
                      })
                    );
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={family}
                    title={family}
                    loading="lazy"
                    className="dark:invert"
                  />
                </SidebarMenuGridItem>
              );
            }}
            items={icons}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

type ReflectUIIconData = {
  host: "material" | "ant-design" | "radix-ui" | "unicons" | (string | {});
  family: string;
  variant: "default" | (string | {});
  default_size: number;
};

function useReflectIconsData() {
  const json = "https://reflect-icons.s3.us-west-1.amazonaws.com/all.json";
  const [icons, setIcons] = useState<{
    [key: string]: ReflectUIIconData;
  }>({});
  useEffect(() => {
    fetch(json).then((res) => {
      res.json().then((data) => {
        setIcons(data);
      });
    });
  }, []);

  return icons;
}

function reflect_icon_link(icon: ReflectUIIconData) {
  const base = "https://reflect-icons.s3.us-west-1.amazonaws.com";
  const ext = "svg";
  const { host, family, variant } = icon;
  if (variant === "default") {
    return `${base}/${host}/${family}.${ext}`;
  } else {
    return `${base}/${host}/${family}_${variant}.${ext}`;
  }
}

function useGridaStdShapes() {
  const base = "https://grida-std.s3.us-west-1.amazonaws.com/shapes-basic";
  const json = `${base}/info.json`;

  const [shapes, setShapes] = useState<{ name: string; src: string }[]>([]);
  useEffect(() => {
    fetch(json).then((res) => {
      res.json().then((data) => {
        setShapes(
          data.map(({ name }: { name: string }) => ({
            name: name,
            src: `${base}/${name}`,
          }))
        );
      });
    });
  }, []);

  return shapes;
}
