import React, { useState } from "react";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";
import { WidgetTree } from "../../components/visualization/json-visualization/json-tree";
import { CodeEditor } from "../../components/code-editor";
import { tokenize } from "@designto/token";
import * as react from "@designto/react";
import { mapGrandchildren } from "@design-sdk/core/utils";
import { StylableJsxWidget } from "@web-builder/core";
import * as core from "@reflect-ui/core";
import { react as reactconfig } from "@designto/config";
import { useReflectTargetNode } from "../../query/from-figma";
import { react_presets } from "@grida/builder-config-preset";

export default function FigmaToReactDemoPage() {
  const [targetSelectionNodeId, setTargetSelectionNodeId] = useState<string>();

  //
  const targetNodeConfig = useReflectTargetNode();
  const figmaNode = targetNodeConfig?.figma;
  const reflect = targetNodeConfig?.reflect;
  //

  const handleOnSingleLayerSelect = (id: string) => {
    const newTarget = mapGrandchildren(reflect).find((r) => r.id == id);
    console.log("newTarget", id, newTarget);
    if (newTarget) {
      setTargetSelectionNodeId(id);
      // setReflect(newTarget);
    }
  };

  let reactComponent: reactconfig.ReactComponentOutput;
  let reflectWidget: core.Widget;
  let widgetTree: StylableJsxWidget;
  if (reflect) {
    reflectWidget = tokenize(reflect);
    widgetTree = react.buildReactWidget(reflectWidget);
    const _stringfiedReactwidget = react.buildReactApp(
      widgetTree,
      react_presets.react_default
    );

    reactComponent = _stringfiedReactwidget;
  }

  return (
    <div key={reflect?.id}>
      <DefaultEditorWorkspaceLayout
        leftbar={
          <LayerHierarchy
            data={reflect}
            onLayerSelect={{ single: handleOnSingleLayerSelect }}
          />
        }
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <PreviewAndRunPanel
              key={targetNodeConfig?.url ?? reflect?.id}
              config={{
                src: reactComponent?.code.raw,
                platform: "react",
                componentName: reactComponent?.name,
                sceneSize: {
                  w: reflect?.width,
                  h: reflect?.height,
                },
                fileid: targetNodeConfig?.file,
                sceneid: targetNodeConfig?.node,
              }}
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel key={targetNodeConfig?.node}>
            <InspectionPanelContentWrap>
              <CodeEditor
                key={reactComponent?.code.raw}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                files={{
                  "index.tsx": {
                    raw: reactComponent?.code
                      ? reactComponent?.code.raw
                      : "// No input design provided to be converted..",
                    language: "typescript",
                    name: "index.tsx",
                  },
                }}
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
                <div style={{ flex: 1 }}>
                  <WidgetTree data={figmaNode} />
                </div>
                <div style={{ flex: 1 }}>
                  <WidgetTree data={reflectWidget} />
                </div>
                <div style={{ flex: 1 }}>
                  <WidgetTree data={widgetTree} />
                </div>
              </div>
            </WorkspaceContentPanel>
          </WorkspaceBottomPanelDockLayout>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </div>
  );
}

const InspectionPanelContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
