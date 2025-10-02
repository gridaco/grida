"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  CaretDownIcon,
  CaretUpIcon,
  CircleBackslashIcon,
  DiscIcon,
  DownloadIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ThemedMonacoEditor } from "@/components/monaco";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { __UNSAFE_CONSOLE } from "@/grida-canvas-react/devtools/__unsafe-console";
import type grida from "@grida/schema";
import { useCurrentEditor, useEditorState } from "../use-editor";
import { useRecorder } from "../plugins/use-recorder";
import { saveAs } from "file-saver";

export function DevtoolsPanel() {
  const expandable = useDialogState();

  const onTabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    expandable.openDialog();
  };

  return (
    <Collapsible
      {...expandable.props}
      className="hidden md:block bg-background"
    >
      <Tabs defaultValue="document" className="border w-full h-full">
        <div
          onClick={expandable.toggleOpen}
          className="w-full flex justify-between border-b bg-muted"
        >
          <div className="w-full">
            <TabsList>
              <TabsTrigger
                onClick={onTabClick}
                value="console"
                className="text-xs uppercase"
              >
                Console
              </TabsTrigger>
              <TabsTrigger
                onClick={onTabClick}
                value="document"
                className="text-xs uppercase"
              >
                Document
              </TabsTrigger>
              <TabsTrigger
                onClick={onTabClick}
                value="history"
                className="text-xs uppercase"
              >
                History
              </TabsTrigger>
              <TabsTrigger
                onClick={onTabClick}
                value="recorder"
                className="text-xs uppercase"
              >
                Recorder
              </TabsTrigger>
            </TabsList>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              onClick={(e) => e.stopPropagation()}
              variant="ghost"
              size="icon"
            >
              {expandable.open ? <CaretDownIcon /> : <CaretUpIcon />}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="w-full h-96 overflow-y-scroll">
          <TabsContent value="console" className="h-full">
            <__UNSAFE_CONSOLE />
          </TabsContent>
          <TabsContent value="document" className="h-full">
            <Tabs defaultValue="document" className="w-full h-full">
              <TabsList className="mx-2">
                <TabsTrigger value="hierarchy" className="text-xs uppercase">
                  Hierarchy
                </TabsTrigger>
                <TabsTrigger value="document" className="text-xs uppercase">
                  Document
                </TabsTrigger>
                <TabsTrigger value="editor" className="text-xs uppercase">
                  Editor
                </TabsTrigger>
                <TabsTrigger value="fonts" className="text-xs uppercase">
                  Fonts
                </TabsTrigger>
                <TabsTrigger value="clipboard" className="text-xs uppercase">
                  Clipboard
                </TabsTrigger>
                <TabsTrigger value="selection" className="text-xs uppercase">
                  Selection
                </TabsTrigger>
                <TabsTrigger value="edit-mode" className="text-xs uppercase">
                  Edit Mode
                </TabsTrigger>
              </TabsList>
              <TabsContent value="hierarchy" className="h-full">
                <HierarchyPanel />
              </TabsContent>
              <TabsContent value="document" className="h-full">
                <DocumentPanel />
              </TabsContent>
              <TabsContent value="editor" className="h-full">
                <EditorPanel />
              </TabsContent>
              <TabsContent value="clipboard" className="h-full">
                <UserClipboardPanel />
              </TabsContent>
              <TabsContent value="selection" className="h-full">
                <SelectionPanel />
              </TabsContent>
              <TabsContent value="edit-mode" className="h-full">
                <EditModePanel />
              </TabsContent>
              <TabsContent value="fonts" className="h-full">
                <FontsPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="history" className="h-full">
            <HistoryPanel />
          </TabsContent>
          <TabsContent value="recorder" className="h-full">
            <RecorderPanel />
          </TabsContent>
        </CollapsibleContent>
      </Tabs>
    </Collapsible>
  );
}

function devdata_hierarchy_only(
  document: grida.program.document.Document,
  document_ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext
) {
  const { scenes, nodes } = document;
  return {
    scenes,
    document_ctx,
    nodes: Object.entries(nodes).reduce((acc: any, [id, node]) => {
      acc[id] = {
        id: node.id,
        name: node.name,
        type: node.type,
        children: (node as any).children,
      };
      return acc;
    }, {}),
  };
}

function HierarchyPanel() {
  const editor = useCurrentEditor();
  const state = useEditorState(editor, (state) => state);
  const { document, document_ctx } = state;

  return <JSONContent value={devdata_hierarchy_only(document, document_ctx)} />;
}

function DocumentPanel() {
  const editor = useCurrentEditor();
  const state = useEditorState(editor, (state) => state);
  const { document, document_ctx } = state;
  return <JSONContent value={{ document, document_ctx }} />;
}

function EditorPanel() {
  const editor = useCurrentEditor();
  const state = useEditorState(editor, (state) => state);
  const {
    document,
    document_ctx,
    fontfaces: googlefonts,
    user_clipboard,
    ...state_without_document
  } = state;
  return <JSONContent value={state_without_document} />;
}

function UserClipboardPanel() {
  const editor = useCurrentEditor();
  const state = useEditorState(editor, (state) => state);
  const { user_clipboard } = state;
  return <JSONContent value={user_clipboard} />;
}

function SelectionPanel() {
  const editor = useCurrentEditor();
  const selection = useEditorState(editor, (state) => state.selection);
  const nodes = useEditorState(editor, (state) =>
    selection.map((id) => state.document.nodes[id])
  );
  const value = nodes.length === 1 ? nodes[0] : nodes;
  return <JSONContent value={value} />;
}

function EditModePanel() {
  const editor = useCurrentEditor();
  const content_edit_mode = useEditorState(
    editor,
    (state) => state.content_edit_mode
  );
  return <JSONContent value={content_edit_mode} />;
}

function FontsPanel() {
  const editor = useCurrentEditor();
  const { fontfaces, webfontlist } = useEditorState(editor, (state) => ({
    webfontlist: state.webfontlist,
    fontfaces: state.fontfaces,
  }));

  return (
    <JSONContent
      value={{
        fontfaces,
        webfontlist,
      }}
    />
  );
}

function JSONContent({ value }: { value: unknown }) {
  return (
    <div className="h-full">
      <ThemedMonacoEditor
        height="100%"
        width="100%"
        defaultLanguage="json"
        value={JSON.stringify(value, null, 2)}
        options={{
          minimap: { enabled: false },
          readOnly: true,
        }}
      />
    </div>
  );
}

function HistoryPanel() {
  const editor = useCurrentEditor();
  const history = editor.doc.historySnapshot;
  return <JSONContent value={history} />;
}

function RecorderPanel() {
  const editor = useCurrentEditor();
  const recorder = useRecorder(editor);

  return (
    <div className="p-10 flex flex-row gap-2">
      <Button
        title="Start Recording"
        variant="ghost"
        size="icon"
        onClick={recorder.start}
        disabled={recorder.status !== "idle"}
      >
        <DiscIcon />
      </Button>
      <Button
        title="Stop Recording"
        variant="ghost"
        size="icon"
        onClick={recorder.stop}
        disabled={recorder.status !== "recording"}
      >
        <StopIcon />
      </Button>
      <Button
        title="Replay"
        variant="ghost"
        size="icon"
        onClick={() => recorder.replay()}
        disabled={recorder.nframes === 0 || recorder.status !== "idle"}
      >
        <PlayIcon />
      </Button>
      <Button
        title="Flush"
        variant="ghost"
        size="icon"
        onClick={recorder.clear}
        disabled={recorder.nframes === 0 || recorder.status !== "idle"}
      >
        <TrashIcon />
      </Button>
      <Button
        title="Flush"
        variant="ghost"
        size="icon"
        onClick={recorder.exit}
        disabled={recorder.nframes === 0 || recorder.status !== "playing"}
      >
        <CircleBackslashIcon />
      </Button>
      <Button
        title="Dumps"
        variant="ghost"
        size="icon"
        disabled={recorder.nframes === 0}
        onClick={() => {
          const dumps = recorder.dumps();
          if (!dumps) return;
          const blob = new Blob([dumps], { type: "application/json" });
          saveAs(blob, `grida-canvas-recording-${Date.now()}.jsonl`);
        }}
      >
        <DownloadIcon />
      </Button>
    </div>
  );
}
