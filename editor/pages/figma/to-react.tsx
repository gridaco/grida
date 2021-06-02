import React, { useState } from "react";
import styled from "@emotion/styled";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
import { figmacomp } from "../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import { FigmaTargetNodeConfig } from "@design-sdk/core/utils/figma-api-utils";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";
import { JsonTree } from "../../components/visualization/json-visualization/json-tree";
import { MonacoEditor } from "../../components/code-editor";
import { tokenize } from "@designto/token";
import * as react from "@designto/react";

// set image repo for figma platform
MainImageRepository.instance = new ImageRepositories();

export default function FigmaToReactDemoPage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [targetnodeConfig, setTargetnodeConfig] =
    useState<FigmaTargetNodeConfig>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  const handleTargetAquired = (target: FigmaTargetNodeConfig) => {
    setTargetnodeConfig(target);
  };

  let widgetCode: string;
  let widgetTree;
  if (reflect) {
    const _reflectWidget = tokenize(reflect);
    widgetTree = react.buildReactWidget(_reflectWidget);
    const _stringfiedReactwidget = react.buildReactApp(widgetTree, {
      template: "cra",
    });

    widgetCode = _stringfiedReactwidget;
  }

  return (
    <>
      <DefaultEditorWorkspaceLayout leftbar={<LayerHierarchy data={reflect} />}>
        <figmacomp.FigmaScreenImporter
          onImported={handleOnDesignImported}
          onTargetEnter={handleTargetAquired}
        />
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <PreviewAndRunPanel
              config={{
                src: widgetCode,
                platform: "web",
                sceneSize: {
                  w: reflect?.width,
                  h: reflect?.height,
                },
                fileid: targetnodeConfig?.file,
                sceneid: targetnodeConfig?.node,
              }}
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel>
            <InspectionPanelContentWrap>
              <MonacoEditor
                key={widgetCode}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                defaultValue={
                  widgetCode
                    ? widgetCode
                    : "// No input design provided to be converted.."
                }
              />
            </InspectionPanelContentWrap>
          </WorkspaceContentPanel>
          <WorkspaceBottomPanelDockLayout>
            <WorkspaceContentPanel>
              <JsonTree data={widgetTree} />
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
