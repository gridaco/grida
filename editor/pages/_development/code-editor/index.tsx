import React from "react";
import { CodeEditor, Files } from "../../../components/code-editor";

export default function CodeEditorDevPage() {
  const files: Files = {
    "index.ts": {
      name: "index.ts",
      language: "typescript",
      raw: `export * from "./components"`,
    },
    "components/index.ts": {
      name: "index.ts",
      language: "typescript",
      raw: `export * from "./app-bar"`,
    },
  };

  return <CodeEditor files={files} />;
}
