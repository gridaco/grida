import styled from "@emotion/styled";
import { IsolatedCanvas } from "components/canvas";
import { CodeEditor } from "components/code-editor";
import { DefaultEditorWorkspaceLayout } from "layout/default-editor-workspace-layout";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layout/panel";
import React, { useEffect, useState } from "react";
import { colors } from "theme";
import bundler from "@code-editor/esbuild-services";
import { debounce } from "utils/debounce";
import { VanillaESBuildAppRunner } from "components/app-runner";

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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <IsolatedCanvas
                building={isbuilding}
                defaultSize={{
                  width: 375,
                  height: 812,
                }}
              >
                <VanillaESBuildAppRunner
                  doc={{
                    html: html_code,
                    css: "",
                    javascript: jsout,
                  }}
                />
              </IsolatedCanvas>
            </div>
          </WorkspaceContentPanel>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}

const CodeEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;
