import * as monaco from "monaco-editor";
import { Monaco } from "@monaco-editor/react";
import { registerDocumentPrettier } from "@code-editor/prettier-services";
import { registerJsxHighlighter } from "@code-editor/jsx-syntax-highlight-services";
import { registerPresetTypes } from "./register-preset-types";

type CompilerOptions = monaco.languages.typescript.CompilerOptions;

export const initEditor = (
  editor: monaco.editor.IStandaloneCodeEditor,
  monaco: Monaco
) => {
  const { dispose: disposeJsxHighlighter } = registerJsxHighlighter(
    editor,
    monaco
  );

  const { dispose: disposePrettier } = registerDocumentPrettier(editor, monaco);

  const { dispose: dispostPresetTypesLoader } = registerPresetTypes();

  return () => {
    disposeJsxHighlighter();
    disposePrettier();
    dispostPresetTypesLoader();
  };
};

export const initMonaco = (monaco: Monaco) => {
  definetheme(monaco);
  baseConfigure(monaco);
};

const definetheme = (monaco: Monaco) => {
  // define theme
  monaco.editor.defineTheme("grida-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      // line number
      "editorLineNumber.foreground": "#555",
      "editorLineNumber.activeForeground": "#fff",

      // background
      "editor.background": "#141414", // rgb(20, 20, 20)

      // selected line highlight
      "editor.lineHighlightBackground": "#FFFFFF10",
      "editor.lineHighlightBorder": "#00000000",
    },
  });
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
