import React, { useEffect } from "react";
import Editor, { useMonaco, Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import _react_type_def_txt from "./react.d.ts.txt";

export interface MonacoEditorProps {
  defaultValue?: string;
  defaultLanguage?: string;
  width?: number | string;
  height?: number | string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

export function MonacoEditor(props: MonacoEditorProps) {
  const monaco: Monaco = useMonaco();
  useEffect(() => {
    if (monaco) {
      setup_react_support(monaco);
      // monaco.mo
    }
  }, [monaco]);

  return (
    <Editor
      width={props.width}
      height={props.height}
      defaultLanguage={
        pollyfill_language(props.defaultLanguage) ?? "typescript"
      }
      defaultValue={props.defaultValue ?? "// no content"}
      theme="vs-dark"
      options={{ ...props.options }}
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

  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    _react_type_def_txt
  );
}

export { useMonaco } from "@monaco-editor/react";
