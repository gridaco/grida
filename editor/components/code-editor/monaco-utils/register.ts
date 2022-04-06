import * as monaco from "monaco-editor";
import { Monaco, OnMount } from "@monaco-editor/react";
import { registerDocumentPrettier } from "./register-prettier";
import { registerJsxHighlighter } from "./register-jsx";
import { registerTypesWorker } from "./register-typings";

type CompilerOptions = monaco.languages.typescript.CompilerOptions;

export const initEditor: OnMount = (editor, monaco) => {
  console.log("Init editor");
  registerJsxHighlighter(editor, monaco);
  registerDocumentPrettier(editor, monaco);
};

export const initMonaco = (monaco: Monaco) => {
  console.log("Init Monaco");

  baseConfigure(monaco);

  const { dispose } = registerTypesWorker(monaco);

  // Dispose all disposables and terminate all workers
  return () => {
    dispose();
  };
};

const baseConfigure = (monaco: Monaco) => {
  monaco.languages.typescript.typescriptDefaults.setMaximumWorkerIdleTime(-1);
  monaco.languages.typescript.javascriptDefaults.setMaximumWorkerIdleTime(-1);

  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  // compiler options
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.Latest,
    allowNonTsExtensions: true,
  });

  /**
   * Configure the typescript compiler to detect JSX and load type definitions
   */

  const opts: CompilerOptions = {
    allowJs: true,
    allowSyntheticDefaultImports: true,
    alwaysStrict: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    noEmit: true,
    reactNamespace: "React",
    typeRoots: ["node_modules/@types"],
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.ES2016,
    jsxFactory: "React.createElement",
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(opts);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(opts);
};
