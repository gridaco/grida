import React, { useRef, useEffect } from "react";
import Editor, { useMonaco, Monaco, OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { MonacoEmptyMock } from "./monaco-mock-empty";
import { register } from "./monaco-utils";

type ICodeEditor = monaco.editor.IStandaloneCodeEditor;

export interface MonacoEditorProps {
  defaultValue?: string;
  defaultLanguage?: string;
  width?: number | string;
  height?: number | string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

export function MonacoEditor(props: MonacoEditorProps) {
  const instance = useRef<{ editor: ICodeEditor; format: any } | null>(null);
  const activeModel = useRef<any>();

  const monaco: Monaco = useMonaco();
  useEffect(() => {
    if (monaco) {
      setup_react_support(monaco);
    }
  }, [monaco]);

  const onMount: OnMount = (editor, monaco) => {
    const format = editor.getAction("editor.action.formatDocument");
    instance.current = { editor, format };

    activeModel.current = editor.getModel();

    register.initEditor(editor, monaco);

    editor.onDidChangeModelContent(() => {
      /* add here */
    });
  };

  return (
    <Editor
      beforeMount={register.initMonaco}
      onMount={onMount}
      width={props.width}
      height={props.height}
      defaultLanguage={
        pollyfill_language(props.defaultLanguage) ?? "typescript"
      }
      loading={<MonacoEmptyMock l={5} />}
      defaultValue={props.defaultValue ?? "// no content"}
      theme="vs-dark"
      options={{
        ...props.options,
        // overrided default options
        wordWrap: "off",
        unusualLineTerminators: "off",
      }}
    />
  );
}

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

function setup_react_support(monaco: Monaco) {
  // adding jsx support - https://github.com/microsoft/monaco-editor/issues/264
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    reactNamespace: "React",
    allowJs: true,
  });

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

export { useMonaco } from "@monaco-editor/react";
