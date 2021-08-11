import React, { useState, useEffect } from "react";
import { format } from "@base-sdk/functions-code-format";
import Editor, { useMonaco } from "@monaco-editor/react";

export interface ScaffoldCodeBlockProps {
  source: string;
  lang: "html" | "ts" | "js" | "dart";
}

const monacolangmap = {
  html: "html",
  ts: "typescript",
  js: "javascript",
  dart: "dart",
};

export function ScaffoldCodeBlock(props: ScaffoldCodeBlockProps) {
  const monaco = useMonaco();
  const [source, setSource] = useState(props.source);
  const onformat = () => {
    formatthis();
  };

  const formatthis = () => {
    format({
      code: source,
      lang: props.lang,
    })
      .then((c) => {
        setSource(c);
      })
      .catch((_) => {
        console.error(_);
      });
  };

  useEffect(() => {
    formatthis();

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
    }
  }, [props.source]);

  const monacolang = monacolangmap[props.lang];
  return (
    <>
      <Editor
        key={source}
        height="90vh"
        // theme="vs-dark"
        options={{
          scrollbar: {
            alwaysConsumeMouseWheel: false,
          },
          showFoldingControls: "mouseover",
          lineNumbers: "off",
          glyphMargin: true,
          scrollBeyondLastLine: false,
          readOnly: true,
          renderFinalNewline: true,
          lineDecorationsWidth: "12px",
        }}
        defaultLanguage={monacolang}
        defaultValue={source}
      />
      {/* <pre>
        <code>{source}</code>
      </pre> */}
      <FormatButton onClick={onformat} />
    </>
  );
}

function FormatButton(props: { onClick: () => void }) {
  return <button onClick={props.onClick}>format</button>;
}
