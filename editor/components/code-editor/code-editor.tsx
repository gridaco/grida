//// dynamic code editor. supports codemirror & monaco
import React from "react";
import CodeMirror from "./code-mirror";
import { MonacoEditor } from "./monaco";

interface DynamicEdotorProps {
  host?: _Host;
}

type _Host = "codemirror" | "monaco" | "auto";
// uses monaco by default. when set auto or host not provided.
const fallbackAutoHost = "monaco";

export function CodeEditor(props: DynamicEdotorProps) {
  const _editorname = getTargetEditorName(props.host);

  switch (_editorname) {
    case "codemirror":
      return <CodeMirror />;
    case "monaco":
      return <MonacoEditor />;
  }
}

function getTargetEditorName(host?: _Host): "codemirror" | "monaco" {
  if (!host) {
    return fallbackAutoHost;
  }

  switch (host) {
    case "auto":
      return fallbackAutoHost;
    case "codemirror":
      return "codemirror";
    case "monaco":
      return "monaco";
  }

  throw `invalid host option provided - "${host}"`;
}
