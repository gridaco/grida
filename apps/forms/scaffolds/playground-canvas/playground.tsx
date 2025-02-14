"use client";

import React, { useEffect, useMemo, useReducer, useState } from "react";
import {
  SidebarMenuGrid,
  SidebarMenuGridItem,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
  SidebarVirtualizedMenuGrid,
} from "@/components/sidebar";
import {
  Align,
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { DocumentProperties } from "@/scaffolds/sidecontrol/sidecontrol-document-properties";
import { NodeHierarchyList } from "@/scaffolds/sidebar/sidebar-node-hierarchy-list";
import {
  StandaloneDocumentEditor,
  StandaloneDocumentContent,
  ViewportRoot,
  EditorSurface,
  standaloneDocumentReducer,
  initDocumentEditorState,
  useDocument,
} from "@/grida-react-canvas";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GridaLogo } from "@/components/grida-logo";
import { DevtoolsPanel } from "@/grida-react-canvas/devtools";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import {
  ButtonIcon,
  CaretDownIcon,
  DownloadIcon,
  FigmaLogoIcon,
  FileIcon,
  GearIcon,
  GitHubLogoIcon,
  OpenInNewWindowIcon,
  PlayIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ImportFromFigmaDialog } from "@/scaffolds/playground-canvas/modals/import-from-figma";
import { iofigma } from "@/grida-io-figma";
import { saveAs } from "file-saver";
import { ImportFromGridaFileJsonDialog } from "@/scaffolds/playground-canvas/modals/import-from-grida-file";
import { v4 } from "uuid";
import { grida } from "@/grida";
import { HelpFab } from "@/scaffolds/help/editor-help-fab";
import { Badge } from "@/components/ui/badge";
import { PlaygroundToolbar } from "./toolbar";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  StandaloneDocumentBackground,
} from "@/grida-react-canvas/renderer";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import { SlackIcon } from "lucide-react";

const CANVAS_BG_COLOR = { r: 200, g: 200, b: 200, a: 1 };

export default function CanvasPlayground() {
  useDisableSwipeBack();

  const [pref, setPref] = useState<Preferences>({ debug: false });
  const [uiHidden, setUiHidden] = useState(false);
  const [exampleid, setExampleId] = useState<string>("blank.grida");
  const playDialog = useDialogState("play", {
    refreshkey: true,
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
    initDocumentEditorState({
      editable: true,
      debug: pref.debug,
      document: {
        root_id: "root",
        nodes: {
          root: {
            id: "root",
            name: "root",
            active: true,
            locked: false,
            type: "container",
            children: [],
            width: 800,
            height: 600,
            position: "relative",
            style: {},
            opacity: 1,
            zIndex: 0,
            rotation: 0,
            expanded: false,
            cornerRadius: 0,
            padding: 0,
            layout: "flow",
            direction: "horizontal",
            mainAxisAlignment: "start",
            crossAxisAlignment: "start",
            mainAxisGap: 0,
            crossAxisGap: 0,
          },
        },
        properties: {},
        backgroundColor: CANVAS_BG_COLOR,
      },
    })
  );

  useHotkeys("meta+\\, ctrl+\\", () => {
    setUiHidden((v) => !v);
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
    fetch(`/examples/canvas/${exampleid}`).then((res) => {
      res.json().then((file) => {
        dispatch({
          type: "__internal/reset",
          key: exampleid,
          state: initDocumentEditorState({
            editable: true,
            document: file.document,
          }),
        });
      });
    });
  }, [exampleid]);

  const onExport = () => {
    const documentData = {
      doctype: "v0_document",
      document: state.document,
    } satisfies grida.io.DocumentFileModel;

    const blob = new Blob([JSON.stringify(documentData, null, 2)], {
      type: "application/json",
    });

    saveAs(blob, `${v4()}.grida`);
  };

  return (
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
              key: file.document.root_id,
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
              type: "__internal/reset",
              key: res.document.id,
              state: initDocumentEditorState({
                editable: true,
                document: iofigma.restful.factory.document(
                  res.document as any,
                  res.images,
                  {
                    gradient_id_generator: () => v4(),
                  }
                ),
              }),
            });
          }}
        />
        <Dialog {...playDialog.props} key={playDialog.refreshkey}>
          <DialogContent className="max-w-screen h-screen">
            <StandaloneDocumentEditor editable={false} initial={state}>
              <div className="w-full h-full flex items-center justify-center overflow-hidden">
                <div className="rounded shadow-lg border overflow-hidden select-none">
                  <StandaloneDocumentContent />
                </div>
              </div>
            </StandaloneDocumentEditor>
          </DialogContent>
        </Dialog>
        <ErrorBoundary>
          <StandaloneDocumentEditor
            editable
            debug={pref.debug}
            initial={state}
            dispatch={dispatch}
          >
            <Hotkyes />
            <div className="flex w-full h-full">
              {!uiHidden && (
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
                      <SidebarRoot className="hidden sm:block">
                        <SidebarSection className="mt-4">
                          <span className="px-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger>
                                <GridaLogo className="inline-block w-4 h-4 me-2" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem
                                  onClick={importFromFigmaDialog.openDialog}
                                >
                                  <FigmaLogoIcon className="w-3.5 h-3.5 me-2 inline-block" />
                                  Import from Figma
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={importFromJson.openDialog}
                                >
                                  <FileIcon className="w-3.5 h-3.5 me-2 inline-block" />
                                  Import from .grida
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={onExport}>
                                  <DownloadIcon className="w-3.5 h-3.5 me-2 inline-block" />
                                  Save as .grida
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={settingsDialog.openDialog}
                                >
                                  <GearIcon className="me-2" />
                                  Settings
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <OpenInNewWindowIcon className="me-2" />
                                    Tools
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    <Link
                                      href="/canvas/tools/io-figma"
                                      target="_blank"
                                    >
                                      <DropdownMenuItem>
                                        <OpenInNewWindowIcon className="me-2" />
                                        IO Figma
                                      </DropdownMenuItem>
                                    </Link>
                                    <Link
                                      href="/canvas/tools/io-svg"
                                      target="_blank"
                                    >
                                      <DropdownMenuItem>
                                        <OpenInNewWindowIcon className="me-2" />
                                        IO SVG
                                      </DropdownMenuItem>
                                    </Link>
                                    <Link
                                      href="https://github.com/gridaco/p666"
                                      target="_blank"
                                    >
                                      <DropdownMenuItem>
                                        <OpenInNewWindowIcon className="me-2" />
                                        P666 Daemon
                                      </DropdownMenuItem>
                                    </Link>
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <Link
                                  href="https://github.com/gridaco/grida"
                                  target="_blank"
                                >
                                  <DropdownMenuItem>
                                    <GitHubLogoIcon className="me-2" />
                                    GitHub
                                  </DropdownMenuItem>
                                </Link>
                                <Link
                                  href="https://grida.co/join-slack"
                                  target="_blank"
                                >
                                  <DropdownMenuItem>
                                    <SlackIcon className="me-2 w-4 h-4" />
                                    Slack Community
                                  </DropdownMenuItem>
                                </Link>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="font-bold text-xs">
                              Canvas Playground
                              <Badge variant="outline" className="ms-2 text-xs">
                                BETA
                              </Badge>
                            </span>
                          </span>
                        </SidebarSection>
                        <SidebarSection className="mt-4">
                          <ExampleSwitch
                            value={exampleid}
                            onValueChange={setExampleId}
                          />
                        </SidebarSection>
                        <hr />
                        <SidebarSection>
                          <SidebarSectionHeaderItem>
                            <SidebarSectionHeaderLabel>
                              Layers
                            </SidebarSectionHeaderLabel>
                          </SidebarSectionHeaderItem>
                          <NodeHierarchyList />
                        </SidebarSection>
                      </SidebarRoot>
                    </>
                  )}
                </aside>
              )}
              <EditorSurfaceClipboardSyncProvider>
                <EditorSurfaceDropzone>
                  <EditorSurfaceContextMenu>
                    <StandaloneDocumentBackground className="w-full h-full flex flex-col relative ">
                      <ViewportRoot className="relative w-full h-full overflow-hidden">
                        <EditorSurface />
                        <AutoInitialFitTransformer>
                          <StandaloneDocumentContent />
                        </AutoInitialFitTransformer>

                        {!uiHidden && (
                          <>
                            <div className="absolute top-4 left-4 z-50">
                              <Button
                                variant={
                                  libraryDialog.open ? "default" : "outline"
                                }
                                className="w-8 h-8 rounded-full p-0"
                                onClick={libraryDialog.openDialog}
                              >
                                <PlusIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          </>
                        )}
                        {!uiHidden && (
                          <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
                            <PlaygroundToolbar
                              onAddButtonClick={libraryDialog.openDialog}
                            />
                          </div>
                        )}
                      </ViewportRoot>
                      {pref.debug && <DevtoolsPanel />}
                    </StandaloneDocumentBackground>
                  </EditorSurfaceContextMenu>
                </EditorSurfaceDropzone>
              </EditorSurfaceClipboardSyncProvider>
              {!uiHidden && (
                <aside className="h-full">
                  <SidebarRoot side="right" className="hidden sm:block">
                    <div className="p-2">
                      <div className="flex items-center justify-end gap-2">
                        <Zoom
                          className={cn(
                            WorkbenchUI.inputVariants({
                              variant: "input",
                              size: "xs",
                            }),
                            "w-auto"
                          )}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={playDialog.openDialog}
                        >
                          <PlayIcon />
                        </Button>
                      </div>
                    </div>
                    <hr />
                    <FontFamilyListProvider fonts={fonts}>
                      <Align />
                      <hr />
                      <Selection
                        empty={
                          <div className="mt-4 mb-10">
                            <DocumentProperties />
                          </div>
                        }
                      />
                    </FontFamilyListProvider>
                  </SidebarRoot>
                </aside>
              )}
            </div>
          </StandaloneDocumentEditor>
        </ErrorBoundary>
        {!uiHidden && <HelpFab />}
      </main>
    </TooltipProvider>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}

const examples = [
  "blank.grida",
  "helloworld.grida",
  "slide-01.grida",
  "slide-02.grida",
  "instagram-post-01.grida",
  "poster-01.grida",
  "resume-01.grida",
  "event-page-01.grida",
  "component-01.grida",
  "layout-01.grida",
  "globals-01.grida",
];

function ExampleSwitch({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange: (v: string) => void;
}) {
  return (
    <Select defaultValue={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Examples" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Examples</SelectLabel>
          {examples.map((example) => (
            <SelectItem key={example} value={example}>
              <span className="capitalize">
                {example.split(".")[0].split("-").join(" ")}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
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
