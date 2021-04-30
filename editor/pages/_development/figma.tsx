import React from "react";
import { figmacomp } from "../../components";
import Editor from "@monaco-editor/react";

export default function FigmaDeveloperPage() {
  return (
    <>
      <figmacomp.FigmaScreenImporter />
      <Editor
        width={500}
        height={800}
        defaultLanguage="javascript"
        defaultValue="// some comment"
        onMount={(d) => {
          console.log("d", d);
        }}
      />
    </>
  );
}
