import React, { useState } from "react";
import { MonacoEditor, MonacoEditorProps as MonacoEditorProps } from "./monaco";
import { Tabs, Tab } from "@mui/material";

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
  const [filekey, setFilekey] = useState<string>(keys[0]);
  const getfile = (key: string) => files[key];
  const handleChange = (event, newValue) => {
    setFilekey(newValue);
  };

  const file = getfile(filekey);

  return (
    <>
      {keys.length >= 2 && (
        <Tabs
          value={filekey}
          onChange={handleChange}
          indicatorColor="primary"
          textColor="inherit"
          variant="scrollable"
          scrollButtons={false}
          style={{ color: "white" }}
          aria-label="scrollable prevent tabs example"
        >
          {Object.keys(files).map((name) => {
            return <Tab key={name} label={name} value={name} />;
          })}
        </Tabs>
      )}
      <MonacoEditor
        key={filekey}
        {...editor_props}
        onChange={(v: string, e) => {
          onChange?.(filekey, v, e);
        }}
        defaultLanguage={file.language}
        defaultValue={file.raw}
      />
    </>
  );
}
