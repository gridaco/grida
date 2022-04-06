import styled from "@emotion/styled";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";
import { IsolatedCanvas } from "components/canvas";
import { CodeEditor } from "components/code-editor";
import { DefaultEditorWorkspaceLayout } from "layout/default-editor-workspace-layout";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layout/panel";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { colors } from "theme";
import bundler from "@code-editor/esbuild-services";
import { debounce } from "utils/debounce";

const component_code = `
import React from 'react';
import ReactDOM from 'react-dom';

const App = () => <>Hi</>

ReactDOM.render(<App />, document.querySelector('#root'));`;

export default function SandboxPage() {
  const html_code = `<div id="root"></div>`;

  const [isbuilding, setIsbuilding] = useState(false);
  const [jsout, setJsOut] = useState<string>();
  const [script, setScript] = useState<string>(component_code);

  useEffect(() => {
    setIsbuilding(true);
    bundler(script, "tsx")
      .then((d) => {
        console.log(d);
        if (d.err == null) {
          if (d.code && d.code !== jsout) {
            setJsOut(d.code);
          }
        }
      })
      .finally(() => {
        setIsbuilding(false);
      });
  }, [script]);

  const onChangeHandler = debounce((k, code) => {
    setScript(code);
  }, 500);

  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={colors.color_editor_bg_on_dark}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel flex={6}>
            <>
              <CodeEditorContainer>
                <CodeEditor
                  height="100vh"
                  options={{
                    automaticLayout: true,
                  }}
                  files={{
                    "component.tsx": {
                      raw: script,
                      language: "tsx",
                      name: "component.tsx",
                    },
                  }}
                  onChange={onChangeHandler}
                />
              </CodeEditorContainer>
            </>
          </WorkspaceContentPanel>
          <WorkspaceContentPanel
            flex={4}
            zIndex={1}
            backgroundColor={colors.color_editor_bg_on_dark}
          >
            <PreviewSegment
              building={isbuilding}
              doc={{
                html: html_code,
                css: "",
                javascript: jsout,
              }}
            />
          </WorkspaceContentPanel>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}

function PreviewSegment({
  doc,
  building,
}: {
  building: boolean;
  doc?: {
    html: string;
    css: string;
    javascript: string;
  };
}) {
  const ref = useRef<HTMLIFrameElement>();

  const loadCode = useCallback(
    (e: HTMLIFrameElement) => {
      e?.contentWindow?.postMessage({ html: doc?.html }, "*");
      e?.contentWindow?.postMessage({ css: doc?.css }, "*");
      e?.contentWindow?.postMessage({ javascript: doc?.javascript }, "*");
    },
    [doc?.html, doc?.css, doc?.javascript]
  );

  useEffect(() => {
    if (ref.current) {
      loadCode(ref.current);
    }
  }, [doc?.html, doc?.css, doc?.javascript]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <IsolatedCanvas
        building={building}
        defaultSize={{
          width: 375,
          height: 812,
        }}
      >
        <VanillaRunner
          ref={ref}
          onLoad={(e) => loadCode(e.currentTarget)}
          style={{
            borderRadius: 4,
            backgroundColor: "white",
            boxShadow: "0px 0px 48px #00000020",
          }}
          source={_html}
          width="100%"
          height="100%"
          componentName={"preview"}
        />
      </IsolatedCanvas>
    </div>
  );
}

const CodeEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;

const _html = `
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview</title>
    <style id="_style"></style>
</head>

<body>
    <div id="root"></div>
</body>

<script type="module">

const _log = console.log

const types = ['log', 'debug', 'info', 'warn', 'error', 'table', 'clear', 'time', 'timeEnd', 'count' , 'assert']

function proxy(context, method, message) { 
    return function() {
        window.parent.postMessage({type: "console", method: method.name, data: JSON.stringify(Array.prototype.slice.apply(arguments))}, '*');
    }
  }

  types.forEach(el =>  {
    window.console[el] = proxy(console, console[el], el)
  })

function setHtml(html) {
    document.body.innerHTML = html
}

  function executeJs(javascript) {
    try {
        eval(javascript)
    } catch (err) {
        console.error(err.message)
    }
}

  function setCss(css) {
    const style = document.getElementById('_style')
    const newStyle = document.createElement('style')
    newStyle.id = '_style'
    newStyle.innerHTML = typeof css === 'undefined' ? '' : css
    style.parentNode.replaceChild(newStyle, style)
  }

  window.addEventListener(
    "error",
    (event) => {
       console.error(event.error)
    },
    false
);

    window.addEventListener(
        "message",
        (e) => {
            if (typeof e.data.html !== 'undefined'){
                setHtml(e.data.html)
            }

           if (typeof e.data.javascript !== 'undefined'){
             executeJs(e.data.javascript)
           } 

           if (typeof e.data.css !== 'undefined'){
            setCss(e.data.css)
           } 
        },
        false
    );
    </script> 

</html>
`;
