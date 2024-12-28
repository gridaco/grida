"use client";

import React, { useEffect, useRef, useState } from "react";
import { useDocument } from "@/grida-canvas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CaretDownIcon, CaretUpIcon } from "@radix-ui/react-icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useMonaco } from "@monaco-editor/react";
import { ThemedMonacoEditor } from "@/components/monaco";
import * as monaco from "monaco-editor";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useGoogleFontsList } from "../google.fonts";
import { useThrottle } from "@uidotdev/usehooks";
import toast from "react-hot-toast";

export function DevtoolsPanel() {
  const { state: _state } = useDocument();
  const fonts = useGoogleFontsList();
  const expandable = useDialogState();

  const state = useThrottle(_state, 1000);

  const {
    document,
    document_ctx,
    history,
    googlefonts,
    user_clipboard,
    ...state_without_document
  } = state;

  const onTabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    expandable.openDialog();
  };

  return (
    <Collapsible {...expandable.props}>
      <Tabs defaultValue="document" className="border-t">
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
                value="editor"
                className="text-xs uppercase"
              >
                Editor
              </TabsTrigger>
              <TabsTrigger
                onClick={onTabClick}
                value="fonts"
                className="text-xs uppercase"
              >
                Fonts
              </TabsTrigger>
              <TabsTrigger
                onClick={onTabClick}
                value="clipboard"
                className="text-xs uppercase"
              >
                Clipboard
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
        <CollapsibleContent className="h-96">
          <TabsContent
            value="console"
            className="px-2 overflow-scroll w-full h-full"
          >
            <__UNSAFE_CONSOLE />
          </TabsContent>
          <TabsContent
            value="document"
            className="p-2 overflow-scroll w-full h-full"
          >
            <JSONContent value={{ document, document_ctx }} />
          </TabsContent>
          <TabsContent
            value="editor"
            className="p-2 overflow-scroll w-full h-full"
          >
            <JSONContent value={state_without_document} />
          </TabsContent>
          <TabsContent
            value="clipboard"
            className="p-2 overflow-scroll w-full h-full"
          >
            <JSONContent value={user_clipboard} />
          </TabsContent>
          <TabsContent
            value="fonts"
            className="p-2 overflow-scroll w-full h-full"
          >
            <JSONContent
              value={{
                // used fonts
                fonts: googlefonts,
                // all fonts
                registry: fonts,
              }}
            />
          </TabsContent>
        </CollapsibleContent>
      </Tabs>
    </Collapsible>
  );
}

function JSONContent({ value }: { value: unknown }) {
  return (
    <div className="w-full h-full">
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

const IS_DEV = process.env.NODE_ENV === "development";

function __UNSAFE_CONSOLE() {
  if (!IS_DEV) {
    // okay to ignore hooks rule - since this value does not change
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-sm text-center text-muted-foreground">
          This console is only available in development environment.
          <br />
          Run locally to use this feature.
        </div>
      </div>
    );
  }

  const [entries, setEntries] = useState<
    {
      input: string;
      output: any;
    }[]
  >([]);
  const entriesRef = useRef(entries); // Ref to track the latest entries state
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorHeight, setEditorHeight] = useState(200); // Default height

  const document = useDocument();

  useEffect(() => {
    // @ts-expect-error
    globalThis["grida"] = document;
  }, [document]);

  // Keep the ref in sync with the state
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const onSubmit = (value: string) => {
    if (!value.trim()) return;
    //
    // [DANGEROUS]
    // THIS IS THE ONLY POINT IN THIS APPLICATION WHERE EVAL IS EXPOSED.
    //
    try {
      const output = eval(value);
      setEntries((prev) => [
        ...prev,
        {
          input: value,
          output,
        },
      ]);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEditorDidMount = (
    editor: monaco.editor.IStandaloneCodeEditor
  ) => {
    editorRef.current = editor;

    // Adjust the height based on content
    const updateHeight = () => {
      const contentHeight = editor.getContentHeight();
      setEditorHeight(contentHeight);
    };

    // Listen to content changes
    editor.onDidContentSizeChange(updateHeight);

    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      const value = editor.getValue();
      onSubmit(value);
      editor.setValue("");
    });

    // editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
    //   const value = editor.getValue();
    //   if (value.trim()) return;
    //   // Use the current value from the ref
    //   const lastEntry = entriesRef.current[entriesRef.current.length - 1];
    //   if (lastEntry) {
    //     editor.setValue(lastEntry.input);
    //   }

    //   return;
    // });

    // Set the initial height
    updateHeight();
  };

  return (
    <div className="w-full h-full space-y-4">
      {entries.map((command, index) => (
        <div key={index} className="border p-2">
          <div>
            <span className="text-xs">[IN]:</span>
            <pre className="text-xs">{command.input}</pre>
          </div>
          <hr />
          <div>
            <span className="text-xs">[OUT]:</span>
            <pre className="text-xs">{JSON.stringify(command.output)}</pre>
          </div>
        </div>
      ))}
      <div
        className="border"
        style={{
          height: editorHeight, // Dynamically updated height
        }}
      >
        <ThemedMonacoEditor
          height={editorHeight} // Dynamically set height
          defaultLanguage="javascript"
          options={{
            lineNumbers: "off",
            automaticLayout: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            lineDecorationsWidth: 0,
            padding: { top: 4, bottom: 4 },
          }}
          onMount={handleEditorDidMount}
        />
      </div>
      <div className="h-16" />
    </div>
  );
}
