//// dynamic code editor. supports codemirror & monaco
import React from "react";
import CodeMirror from "./code-mirror";
import { Monaco } from "./monaco";

interface DynamicEdotorProps {
  host?: _Host;
}

type _Host = "codemirror" | "monaco" | "auto";
// uses monaco by default. when set auto or host not provided.
const fallbackAutoHost = "monaco";

export function CodeEdotor(props: DynamicEdotorProps) {
  const _editorname = getTargetEditorName(props.host);

  switch (_editorname) {
    case "codemirror":
      return <CodeMirror />;
    case "monaco":
      return <Monaco />;
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
