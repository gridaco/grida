import React, { useRef } from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { MonacoEmptyMock } from "./monaco-mock-empty";
import { register } from "./monaco-utils";
import { __dangerous__lastFormattedValue__global } from "@code-editor/prettier-services";
import { debounce } from "utils/debounce";

type ICodeEditor = monaco.editor.IStandaloneCodeEditor;

export interface MonacoEditorProps {
  value?: string;
  language?: string;
  onChange?: OnChange;
  width?: number | string;
  height?: number | string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

export function MonacoEditor(props: MonacoEditorProps) {
  const instance = useRef<{ editor: ICodeEditor; format: any } | null>(null);

  const onMount: OnMount = (editor, monaco) => {
    const format = editor.getAction("editor.action.formatDocument");
    const rename = editor.getAction("editor.action.rename");

    instance.current = { editor, format };

    register.initEditor(editor, monaco);

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

    editor.onDidChangeModelContent(() =>
      debounce(() => editor.saveViewState(), 200)
    );
  };

  return (
    <Editor
      beforeMount={register.initMonaco}
      onMount={onMount}
      width={props.width}
      height={props.height}
      language={pollyfill_language(props.language) ?? "typescript"}
      path={"app." + lang2ext(props.language)}
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
