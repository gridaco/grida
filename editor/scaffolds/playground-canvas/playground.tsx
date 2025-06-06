"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { saveAs } from "file-saver";
import { ImportFromGridaFileJsonDialog } from "@/scaffolds/playground-canvas/modals/import-from-grida-file";
import { v4 } from "uuid";
import { HelpFab } from "@/scaffolds/globals/editor-help-fab";
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
import { datatransfer } from "@/grida-canvas/data-transfer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { SlackIcon } from "lucide-react";
import BrushToolbar from "@/grida-canvas-react-starter-kit/starterkit-toolbar/brush-toolbar";
import { io } from "@grida/io";
import { canvas_examples } from "./examples";
import ArtboardsList from "@/grida-canvas-react-starter-kit/starterkit-artboard-list";
import { DarwinSidebarHeaderDragArea } from "../../host/desktop";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  PreviewButton,
  PreviewProvider,
} from "@/grida-canvas-react-starter-kit/starterkit-preview";
import { sitemap } from "@/www/data/sitemap";
import iofigma from "@grida/io-figma";
import { editor } from "@/grida-canvas";
import { useEditor } from "@/grida-canvas-react";
import useDisableSwipeBack from "@/grida-canvas-react/viewport/hooks/use-disable-browser-swipe-back";
import { WindowCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";

type UIConfig = {
  sidebar: "hidden" | "visible";
  toolbar: "hidden" | "visible";
};

const CANVAS_BG_COLOR = { r: 245, g: 245, b: 245, a: 1 };

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

  const instance = useEditor(editor.state.init(document));
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

  const onExport = () => {
    const documentData = {
      version: "0.0.1-beta.1+20250303",
      document: instance.getSnapshot().document,
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
          <ErrorBoundary>
            <StandaloneDocumentEditor editor={instance}>
              <WindowCurrentEditorProvider />
              <SettingsDialog {...settingsDialog.props} />
              <UserCustomTemplatesProvider templates={templates}>
                <FontFamilyListProvider fonts={fonts}>
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
                                        <GridaLogo className="inline-block size-4" />
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="start"
                                        className="min-w-52"
                                      >
                                        <DropdownMenuItem
                                          onClick={importFromJson.openDialog}
                                          className="text-xs"
                                        >
                                          <FileIcon className="size-3.5" />
                                          Open .grida
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={onExport}
                                          className="text-xs"
                                        >
                                          <DownloadIcon className="size-3.5" />
                                          Save as .grida
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={
                                            importFromFigmaDialog.openDialog
                                          }
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
                                            <Link
                                              href="/canvas/tools/ai"
                                              target="_blank"
                                            >
                                              <DropdownMenuItem className="text-xs">
                                                <OpenInNewWindowIcon className="size-3.5" />
                                                AI
                                              </DropdownMenuItem>
                                            </Link>
                                            <Link
                                              href="/canvas/tools/io-figma"
                                              target="_blank"
                                            >
                                              <DropdownMenuItem className="text-xs">
                                                <OpenInNewWindowIcon className="size-3.5" />
                                                IO Figma
                                              </DropdownMenuItem>
                                            </Link>
                                            <Link
                                              href="/canvas/tools/io-svg"
                                              target="_blank"
                                            >
                                              <DropdownMenuItem className="text-xs">
                                                <OpenInNewWindowIcon className="size-3.5" />
                                                IO SVG
                                              </DropdownMenuItem>
                                            </Link>
                                            <Link
                                              href="https://github.com/gridaco/p666"
                                              target="_blank"
                                            >
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
                                                href={
                                                  "/canvas/examples/" +
                                                  example.id
                                                }
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
                                        <Link
                                          href={sitemap.links.github}
                                          target="_blank"
                                        >
                                          <DropdownMenuItem className="text-xs">
                                            <GitHubLogoIcon className="size-3.5" />
                                            GitHub
                                          </DropdownMenuItem>
                                        </Link>
                                        <Link
                                          href={sitemap.links.slack}
                                          target="_blank"
                                        >
                                          <DropdownMenuItem className="text-xs">
                                            <SlackIcon className="size-3.5" />
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
                                        className="size-8 rounded-full p-0"
                                        onClick={libraryDialog.openDialog}
                                      >
                                        <PlusIcon className="size-4" />
                                      </Button>
                                    </div>
                                  </>
                                )}
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
                </FontFamilyListProvider>
              </UserCustomTemplatesProvider>
            </StandaloneDocumentEditor>
          </ErrorBoundary>
          {ui.toolbar === "visible" && <HelpFab />}
        </main>
      </TooltipProvider>
    </SidebarProvider>
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

function SidebarRight() {
  const should_show_artboards_list = useArtboardListCondition();

  return (
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
  const editor = useCurrentEditor();

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
    editor.insertNode(pre);
  };

  const onInsertSvgSrc = (name: string, src: string) => {
    const task = fetch(src, {
      cache: "no-store",
    }).then((res) => {
      // svg content
      res.text().then((svg) => {
        editor.createNodeFromSvg(svg).then((node) => {
          node.$.name = name.split(".svg")[0];
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
                  className="p-2 size-8 rounded-sm"
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

// TODO: use grida library api
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

// TODO: use grida library api
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
