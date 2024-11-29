"use client";

import React, { useEffect, useReducer, useState } from "react";
import {
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { SelectedNodeProperties } from "@/scaffolds/sidecontrol/sidecontrol-selected-node";
import { __TMP_ComponentProperties } from "@/scaffolds/sidecontrol/sidecontrol-component-properties";
import { NodeHierarchyList } from "@/scaffolds/sidebar/sidebar-node-hierarchy-list";
import {
  StandaloneDocumentEditor,
  StandaloneDocumentEditorContent,
  CanvasEventTarget,
  CanvasOverlay,
  standaloneDocumentReducer,
  initDocumentEditorState,
} from "@/builder";
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
import { DevtoolsPanel } from "@/builder/devtools";
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { useGoogleFontsList } from "@/builder/google.fonts";
import {
  DownloadIcon,
  FigmaLogoIcon,
  FileIcon,
  GearIcon,
  OpenInNewWindowIcon,
  PlayIcon,
} from "@radix-ui/react-icons";
import KeyboardInputOverlay from "@/builder/devtools/keyboard-input-overlay";
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
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ImportFromFigmaDialog } from "@/scaffolds/playground-canvas/modals/import-from-figma";
import { iofigma } from "@/grida/io-figma";
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
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemedMonacoEditor } from "@/components/monaco";
import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalStorage } from "@uidotdev/usehooks";
import { CANVAS_PLAYGROUND_LOCALSTORAGE_PREFERENCES_BASE_AI_PROMPT_KEY } from "./k";

export default function CanvasPlayground() {
  const [exampleid, setExampleId] = useState<string>("helloworld.grida");
  const playDialog = useDialogState("play", {
    refreshkey: true,
  });
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
      document: {
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
        root_id: "root",
      },
    })
  );

  useEffect(() => {
    fetch(`/examples/canvas/${exampleid}`).then((res) => {
      res.json().then((file) => {
        dispatch({
          type: "document/reset",
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
    <main className="w-screen h-screen overflow-hidden">
      <SettingsDialog {...settingsDialog} />
      <ImportFromGridaFileJsonDialog
        key={importFromJson.refreshkey}
        {...importFromJson}
        onImport={(file) => {
          dispatch({
            type: "document/reset",
            state: initDocumentEditorState({
              editable: true,
              document: file.document,
            }),
          });
        }}
      />
      <ImportFromFigmaDialog
        {...importFromFigmaDialog}
        onImport={(res) => {
          dispatch({
            type: "document/reset",
            state: initDocumentEditorState({
              editable: true,
              document: iofigma.restful.map.document(
                res.document as any,
                res.images
              ),
            }),
          });
        }}
      />
      <Dialog {...playDialog} key={playDialog.refreshkey}>
        <DialogContent className="max-w-screen h-screen">
          <StandaloneDocumentEditor editable={false} initial={state}>
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
              <div className="rounded shadow-lg border overflow-hidden select-none">
                <StandaloneDocumentEditorContent />
              </div>
            </div>
          </StandaloneDocumentEditor>
        </DialogContent>
      </Dialog>
      <StandaloneDocumentEditor editable initial={state} dispatch={dispatch}>
        <div className="flex w-full h-full">
          <aside>
            <SidebarRoot>
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
                      <DropdownMenuItem onClick={importFromJson.openDialog}>
                        <FileIcon className="w-3.5 h-3.5 me-2 inline-block" />
                        Import from .grida
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onExport}>
                        <DownloadIcon className="w-3.5 h-3.5 me-2 inline-block" />
                        Save as .grida
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={settingsDialog.openDialog}>
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
                          <Link href="/canvas/tools/io-figma" target="_blank">
                            <DropdownMenuItem>
                              <OpenInNewWindowIcon className="me-2" />
                              IO Figma
                            </DropdownMenuItem>
                          </Link>
                          <Link href="/canvas/tools/io-pdf" target="_blank">
                            <DropdownMenuItem>
                              <OpenInNewWindowIcon className="me-2" />
                              IO PDF
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
                <ExampleSwitch value={exampleid} onValueChange={setExampleId} />
              </SidebarSection>
              <hr />
              <SidebarSection>
                <SidebarSectionHeaderItem>
                  <SidebarSectionHeaderLabel>Layers</SidebarSectionHeaderLabel>
                </SidebarSectionHeaderItem>
                <NodeHierarchyList />
              </SidebarSection>
            </SidebarRoot>
          </aside>
          <div className="w-full h-full flex flex-col relative">
            <CanvasEventTarget className="relative w-full h-full no-scrollbar overflow-y-auto bg-transparent">
              <CanvasOverlay />
              <div className="w-full h-full flex bg-background items-center justify-center">
                <div className="shadow-lg rounded-xl border overflow-hidden">
                  <StandaloneDocumentEditorContent />
                </div>
              </div>
            </CanvasEventTarget>
            <div className="absolute bottom-20 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
              <PlaygroundToolbar />
            </div>
            <div className="fixed bottom-20 left-10 flex items-center justify-center z-50 pointer-events-none">
              <KeyboardInputOverlay />
            </div>
            <DevtoolsPanel />
          </div>
          <aside className="h-full">
            <SidebarRoot side="right">
              <div className="p-2">
                <div className="flex justify-end">
                  <Button variant="ghost" onClick={playDialog.openDialog}>
                    <PlayIcon />
                  </Button>
                </div>
              </div>
              <hr />
              <FontFamilyListProvider fonts={fonts}>
                {state.selected_node_id ? (
                  <SelectedNodeProperties />
                ) : (
                  <__TMP_ComponentProperties />
                )}
              </FontFamilyListProvider>
            </SidebarRoot>
          </aside>
        </div>
      </StandaloneDocumentEditor>
      <HelpFab />
    </main>
  );
}

function ExampleSwitch({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange: (v: string) => void;
}) {
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
  ];
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

function SettingsDialog(props: React.ComponentProps<typeof Dialog>) {
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
        <Tabs defaultValue="ai">
          <TabsList>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>
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
        <hr />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
