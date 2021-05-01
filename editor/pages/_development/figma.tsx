import React from "react";
import { figmacomp } from "../../components";

import dynamic from "next/dynamic";

// const MonacoEditor = dynamic(import("@monaco-editor/react"), { ssr: false });
// import MonacoEditor from "@monaco-editor/react";
// import { UnControlled as CodeMirror } from "react-codemirror2";
const CodeWithCodemirror = dynamic(import("../../components/code-mirror"), {
  ssr: false,
});

// const DynamicComponentWithNoSSR = dynamic(
//   () => import("@monaco-editor/react"),
//   { ssr: false }
// );

export default function FigmaDeveloperPage() {
  return (
    <>
      <figmacomp.FigmaScreenImporter />
      <CodeWithCodemirror
        value="console.log(0, d);"
        options={{
          mode: "javascript",
          theme: "monokai",
          lineNumbers: true,
        }}
      />
    </>
  );
}
