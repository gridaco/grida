import React, { useEffect, useState } from "react";
import { designToCode } from "@designto/code";
import { useDesign } from "../../query/to-code";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";
import { MonacoEditor } from "../../components/code-editor";

export default function DesignToCodeUniversalPage() {
  const design = useDesign();
  console.log("design", design);
  if (!design) {
    return <>Loading..</>;
  }

  const { reflect, url, node, file } = design;
  const code = "//none"; // todo
  const componentName = "none"; // todo

  designToCode(design); // fixme
  return (
    <>
      <DefaultEditorWorkspaceLayout
        leftbar={
          <></>
          // <LayerHierarchy
          //   data={reflect}
          //   onLayerSelect={{ single: handleOnSingleLayerSelect }}
          // />
        }
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <PreviewAndRunPanel
              key={url ?? reflect?.id}
              config={{
                src: code,
                platform: "web",
                componentName: componentName,
                sceneSize: {
                  w: reflect?.width,
                  h: reflect?.height,
                },
                fileid: file,
                sceneid: node,
              }}
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel key={node}>
            <InspectionPanelContentWrap>
              <MonacoEditor
                key={code}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                defaultValue={
                  code ? code : "// No input design provided to be converted.."
                }
              />
            </InspectionPanelContentWrap>
          </WorkspaceContentPanel>
          <WorkspaceBottomPanelDockLayout>
            <WorkspaceContentPanel>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                }}
              >
                {/* <div style={{ flex: 1 }}>
                  <WidgetTree data={reflectWidget} />
                </div>
                <div style={{ flex: 1 }}>
                  <WidgetTree data={widgetTree} />
                </div> */}
              </div>
            </WorkspaceContentPanel>
          </WorkspaceBottomPanelDockLayout>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
      {"design = " + design}
      {/*  */}
    </>
  );
}

const InspectionPanelContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
