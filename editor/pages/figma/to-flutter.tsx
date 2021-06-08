import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { figmacomp, canvas, runner } from "../../components";
import { flutter } from "@designto/code";
import { composeAppWithHome } from "@bridged.xyz/flutter-builder";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import { utils_dart } from "../../utils";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
// import { MonacoEditor } from "../../components/code-editor";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import { FigmaTargetNodeConfig } from "@design-sdk/core/utils/figma-api-utils";
import styled from "@emotion/styled";
import { useReflectTargetNode } from "../../query/from-figma";

// set image repo for figma platform
MainImageRepository.instance = new ImageRepositories();

const CodemirrorEditor = dynamic(
  import("../../components/code-editor/code-mirror"),
  {
    ssr: false,
  }
);

export default function FigmaDeveloperPage() {
  //
  const targetNodeConfig = useReflectTargetNode();
  const figmaNode = targetNodeConfig?.figma;
  const reflect = targetNodeConfig?.reflect;
  //

  const flutterAppBuild = reflect && flutter.buildApp(reflect);
  const widget = flutterAppBuild?.widget;
  const app =
    widget &&
    flutter.makeApp({
      widget: widget,
      scrollable: flutterAppBuild.scrollable,
    });

  const widgetCode = utils_dart.format(widget?.build()?.finalize());
  const rootAppCode = app && utils_dart.format(composeAppWithHome(app));

  return (
    <>
      <DefaultEditorWorkspaceLayout leftbar={<LayerHierarchy data={reflect} />}>
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <PreviewAndRunPanel
              config={{
                src: rootAppCode,
                componentName: "DemoComponent",
                platform: "flutter",
                sceneSize: {
                  w: reflect?.width,
                  h: reflect?.height,
                },
                fileid: targetNodeConfig?.file,
                sceneid: targetNodeConfig?.node,
              }}
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel>
            <InspectionPanelContentWrap>
              <CodemirrorEditor
                key={widgetCode}
                options={{
                  lineNumbers: true,
                  mode: "dart",
                  theme: "monokai",
                }}
                value={
                  widgetCode
                    ? widgetCode
                    : "// No input design provided to be converted.."
                }
              />
            </InspectionPanelContentWrap>
          </WorkspaceContentPanel>
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
