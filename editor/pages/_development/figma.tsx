import React from "react";
import { figmacomp } from "../../components";

import dynamic from "next/dynamic";

// const MonacoEditor = dynamic(import("@monaco-editor/react"), { ssr: false });
import MonacoEditor from "@monaco-editor/react";

// const DynamicComponentWithNoSSR = dynamic(
//   () => import("@monaco-editor/react"),
//   { ssr: false }
// );

export default function FigmaDeveloperPage() {
  return (
    <>
      <figmacomp.FigmaScreenImporter />
      {/* <DynamicComponentWithNoSSR
        width={500}
        height={800}
        defaultLanguage="javascript"
        defaultValue="// some comment"
        onMount={(d) => {
          console.log("d", d);
        }}
      /> */}
      <MonacoEditor
        language="dart"
        theme="vs-dark"
        value={"//source"}
        options={{ unusualLineTerminators: "off" }}
        onChange={(value: string) => {
          // editingSource = value;
        }}
      />
    </>
  );
}
