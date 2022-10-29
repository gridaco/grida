import React, { useRef } from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { MonacoEmptyMock } from "./monaco-mock-empty";
import { register } from "./monaco-utils";
import { __dangerous__lastFormattedValue__global } from "@code-editor/prettier-services";
import { debounce } from "utils/debounce";
import { downloadFile } from "utils/download";

type ICodeEditor = monaco.editor.IStandaloneCodeEditor;
type Options = Omit<
  monaco.editor.IStandaloneEditorConstructionOptions,
  "readOnly"
>;
export interface MonacoEditorProps {
  value?: string;
  language?: string;
  onChange?: OnChange;
  width?: number | string;
  height?: number | string;
  options?: Options;
  readonly?: boolean;
  fold_comments_on_load?: boolean;
}

export function MonacoEditor(props: MonacoEditorProps) {
  const instance = useRef<{ editor: ICodeEditor; format: any } | null>(null);

  const path = "app." + lang2ext(props.language);

  const onMount: OnMount = (editor, monaco) => {
    const format = editor.getAction("editor.action.formatDocument");
    const rename = editor.getAction("editor.action.rename");
    // fold all comments
    const fold_comments = editor.getAction("editor.foldAllBlockComments");

    instance.current = { editor, format };

    const dispose = register.initEditor(editor, monaco);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
      format.run();
    });

    // disabled. todo: find a way to format on new line, but also with adding new line.
    // editor.addCommand(monaco.KeyCode.Enter, function () {
    //   // add new line via script, then run format
    //   format.run();
    // });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, function () {
      // don't reload the entire page, and..
      // Default is F2
      rename.run();
    });

    editor.addAction({
      // An unique identifier of the contributed action.
      id: "export-module-as-file",

      // A label of the action that will be presented to the user.
      label: "Export as file",
      precondition: null,
      keybindingContext: null,
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.5,
      run: function (ed) {
        downloadFile({ data: ed.getModel().getValue(), filename: path });
      },
    });

    if (props.fold_comments_on_load) {
      fold_comments.run();
    }

    editor.onDidChangeModelContent(() => {
      debounce(() => editor.saveViewState(), 200);

      if (props.fold_comments_on_load) {
        fold_comments.run();
      }
    });

    editor.onDidDispose(() => {
      dispose();
    });
  };

  return (
    <Editor
      beforeMount={register.initMonaco}
      onMount={onMount}
      width={props.width}
      height={props.height}
      language={pollyfill_language(props.language) ?? "typescript"}
      path={path}
      loading={<MonacoEmptyMock l={5} />}
      value={props.value ?? "// no content"}
      theme="vs-dark"
      onChange={(...v) => {
        if (v[0] === __dangerous__lastFormattedValue__global) {
          // if change is caused by formatter, ignore.
          return;
        }
        props.onChange(...v);
      }}
      options={{
        ...props.options,
        // overrided default options
        readOnly: props.readonly,
        wordWrap: "off",
        unusualLineTerminators: "off",
      }}
    />
  );
}

const lang2ext = (lang: string) => {
  switch (lang) {
    case "typescript":
      return "ts";
    case "javascript":
      return "js";
    case "tsx":
      return "tsx";
    case "jsx":
      return "jsx";
    case "dart":
      return "dart";
    default:
      return lang;
  }
};

const pollyfill_language = (lang: string) => {
  switch (lang) {
    case "tsx":
      return "typescript";
    case "jsx":
      return "javascript";
    default:
      return lang;
  }
};

export { useMonaco } from "@monaco-editor/react";
