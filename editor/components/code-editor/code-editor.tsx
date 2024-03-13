import React, { useState } from "react";
import { MonacoEditor, MonacoEditorProps as MonacoEditorProps } from "./monaco";
import * as Tabs from "@radix-ui/react-tabs";

export interface CodeEditorProps
  extends Omit<MonacoEditorProps, "defaultValue" | "defaultLanguage"> {}
export interface IFile {
  name: string;
  language: string;
  raw: string;
}

export type Files = { [name: string]: IFile };

export function CodeEditor({
  files,
  onChange,
  ...editor_props
}: {
  onChange?: (key: string, value: string, e?) => void;
  files: Files;
} & CodeEditorProps) {
  const keys = Object.keys(files);
  const [fileKey, setFileKey] = useState<string>(keys[0]);
  const getFile = (key: string) => files[key];

  const handleTabChange = (value: string) => {
    setFileKey(value);
  };

  const file = getFile(fileKey);

  return (
    <>
      {keys.length >= 2 && (
        <Tabs.Root
          value={fileKey}
          onValueChange={handleTabChange}
          aria-label="Files"
        >
          <Tabs.List>
            {Object.keys(files).map((name) => (
              <Tabs.Trigger key={name} value={name} style={{ color: "white" }}>
                {name}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      )}
      <MonacoEditor
        key={fileKey}
        {...editor_props}
        onChange={(v: string, e) => {
          onChange?.(fileKey, v, e);
        }}
        language={file.language}
        value={file.raw}
      />
    </>
  );
}
