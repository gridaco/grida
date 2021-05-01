import React, { Component } from "react";
import {
  UnControlled as CodeMirror,
  IUnControlledCodeMirror,
} from "react-codemirror2";
import "codemirror/mode/javascript/javascript";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/monokai.css";

export default function (props: IUnControlledCodeMirror) {
  return (
    <div>
      <CodeMirror {...props} />
    </div>
  );
}
