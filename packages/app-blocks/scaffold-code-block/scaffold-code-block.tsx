import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
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

  const TEXT_MARGIN_LINES = 2;
  const addmargintoTextContent = (text: string): string => {
    let textwithmargin = text;
    const margin = "\n".repeat(TEXT_MARGIN_LINES);
    if (!text.startsWith("\n")) {
      textwithmargin = margin + textwithmargin;
    }

    if (!text.endsWith("\n")) {
      textwithmargin = textwithmargin + margin;
    }
    return textwithmargin;
  };

  const monacolang = monacolangmap[props.lang];

  function marginAppliedLine(line: number): string {
    const originline = line - TEXT_MARGIN_LINES;
    if (originline <= 0) {
      return "";
    } else {
      return originline.toString();
    }
  }

  return (
    <RootWrap>
      <Editor
        key={source}
        height="90vh"
        theme="vs-dark"
        line={TEXT_MARGIN_LINES}
        options={{
          fontFamily: `Menlo, Monaco, 'Courier New', monospace`,
          fontSize: 14,
          minimap: {
            // disable minimap a.k.a preview
            enabled: false,
          },
          // renderIndentGuides: true, // need color customization
          scrollbar: {
            // allow parent scoll
            alwaysConsumeMouseWheel: false,
            useShadows: false,
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          showFoldingControls: "mouseover",
          lineNumbers: "off", //marginAppliedLine,
          lineDecorationsWidth: "12px",
          glyphMargin: true,
          scrollBeyondLastLine: false,
          readOnly: true,
          renderFinalNewline: true,
        }}
        defaultLanguage={monacolang}
        defaultValue={addmargintoTextContent(source)}
      />
      {/* <pre>
        <code>{source}</code>
      </pre> */}
      {/* <FormatButton onClick={onformat} /> */}
    </RootWrap>
  );
}

function FormatButton(props: { onClick: () => void }) {
  return <button onClick={props.onClick}>format</button>;
}

const RootWrap = styled.div`
  margin-top: 12px;
`;
