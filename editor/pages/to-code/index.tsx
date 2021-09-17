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
import { react_presets, flutter_presets } from "@grida/builder-config-preset";
export default function DesignToCodeUniversalPage() {
  const design = useDesign();

  if (!design) {
    return <>Loading..</>;
  }

  const { reflect, url, node, file } = design;
  const { id, name } = reflect;

  const result = designToCode(
    {
      id: id,
      name: name,
      design: reflect,
    },
    flutter_presets.flutter_default
    // react_presets.react_default
  ); // fixme

  const { code, name: componentName } = result; // todo

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
                src: code.raw,
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
                key={code.raw}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                defaultValue={
                  code
                    ? code.raw
                    : "// No input design provided to be converted.."
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
    </>
  );
}

const InspectionPanelContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
