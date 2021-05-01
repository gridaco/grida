import React from "react";
import {
  UnControlled as _CodeMirror,
  IUnControlledCodeMirror,
} from "react-codemirror2";
import * as codemirror from "codemirror";

if (typeof window !== "undefined" && typeof window.navigator !== "undefined") {
  //github.com/vercel/next.js/discussions/11027
  // require('codemirror/mode/yaml/yaml');
  // require('codemirror/mode/dockerfile/dockerfile');
  require("codemirror/mode/javascript/javascript");
  require("codemirror/mode/dart/dart");
  require("codemirror/lib/codemirror.css");
  require("codemirror/theme/monokai.css");
}

export default function CodeMirror(props: IUnControlledCodeMirror) {
  return (
    <div
      style={{
        height: "100vh",
        width: "50vw",
        overflow: "scroll",
      }}
    >
      <_CodeMirror
        {...props}
        editorDidMount={(editor: codemirror.Editor) => {
          editor.setSize("50%", "100%");
        }}
      />
    </div>
  );
}
