"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import toast from "react-hot-toast";
import { useEditorApi } from "@/grida-react-canvas/provider";
import { AutoHeightThemedMonacoEditor } from "@/components/monaco";

const IS_UNSAFE_SANDBOX =
  process.env.NEXT_PUBLIC_GRIDA_UNSAFE_DEVELOPER_SANDBOX === "1";

const monacoOptions = {
  lineNumbers: "off",
  automaticLayout: true,
  scrollBeyondLastLine: false,
  minimap: { enabled: false },
  lineDecorationsWidth: 0,
  padding: { top: 4, bottom: 4 },
} as const;

/**
 * @deprecated
 */
export function __UNSAFE_CONSOLE() {
  if (!IS_UNSAFE_SANDBOX) {
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

  const api = useEditorApi();

  useEffect(() => {
    // @ts-expect-error
    globalThis["grida"] = api;
  }, [api]);

  // Keep the ref in sync with the state
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const onSubmit = (value: string) => {
    value = value.trim();
    if (!value) return;
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
      setEntries((prev) => [
        ...prev,
        {
          input: value,
          output: e.message,
        },
      ]);
      toast.error(e.message);
    }
  };

  const handleEditorDidMount = (
    editor: monaco.editor.IStandaloneCodeEditor
  ) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
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
  };

  return (
    <div className="w-full max-w-full h-full px-2 mt-4 space-y-4">
      {entries.map((command, index) => (
        <div key={index}>
          <div className="flex gap-2">
            <div className="py-1 w-12 text-sm font-semibold">In [{index}]:</div>
            <div className="flex-1">
              <AutoHeightThemedMonacoEditor
                className="border"
                defaultLanguage="javascript"
                value={command.input}
                options={{ ...monacoOptions, readOnly: true }}
              />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <div className="w-12" />
            <div className="flex-1">
              <AutoHeightThemedMonacoEditor
                className="border"
                defaultLanguage="json"
                value={serialize(command.output)}
                options={{ ...monacoOptions, readOnly: true }}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <div className="py-1 w-12 text-sm font-semibold">In [ ]:</div>
        <div className="flex-1">
          <AutoHeightThemedMonacoEditor
            className="border"
            defaultLanguage="javascript"
            options={monacoOptions}
            onMount={handleEditorDidMount}
          />
        </div>
      </div>
      <div className="h-16" />
    </div>
  );
}

const serialize = (value: string) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e: any) {
    return e.message;
  }
};

function SafeSerialized({ value }: { value: any }) {
  const txt = useMemo(() => {
    try {
      return JSON.stringify(value);
    } catch (e: any) {
      return e.message;
    }
  }, [value]);

  return <>{txt}</>;
}
