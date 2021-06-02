import React, { useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
interface EditorProps {
  defaultValue?: string;
  width?: number | string;
  height?: number | string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

export function MonacoEditor(props: EditorProps) {
  const monaco = useMonaco();
  useEffect(() => {
    // adding jsx support - https://github.com/microsoft/monaco-editor/issues/264
    if (monaco) {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution:
          monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        jsx: monaco.languages.typescript.JsxEmit.React,
        reactNamespace: "React",
        allowJs: true,
        typeRoots: ["node_modules/@types"],
      });

      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        "https://cdn.jsdelivr.net/npm/@types/react@16.9.41/index.d.ts"
      );

      // monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      //   jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      // });

      // monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      //   noSemanticValidation: false,
      //   noSyntaxValidation: false,
      // });
    }
  }, [monaco]);

  return (
    <Editor
      width={props.width}
      height={props.height}
      defaultLanguage="typescript"
      defaultValue={props.defaultValue ?? "// no content"}
      theme="vs-dark"
      options={props.options}
    />
  );
}

export { useMonaco } from "@monaco-editor/react";
