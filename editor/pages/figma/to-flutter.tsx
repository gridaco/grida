import React, { useEffect, useState } from "react";
import { flutter } from "@designto/code";
import { composeAppWithHome } from "@bridged.xyz/flutter-builder";
import { utils_dart } from "../../utils";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import styled from "@emotion/styled";
import { useDesign } from "../../query/to-code";
import { MonacoEditor } from "../../components/code-editor";
// set image repo for figma platform
MainImageRepository.instance = new ImageRepositories();

export default function FigmaToFlutterPage() {
  const design = useDesign();

  const flutterAppBuild = design && flutter.buildApp(design.reflect);
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
      <DefaultEditorWorkspaceLayout
        leftbar={<LayerHierarchy data={design?.reflect} />}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <PreviewAndRunPanel
              config={{
                src: rootAppCode,
                componentName: "DemoComponent",
                platform: "flutter",
                sceneSize: {
                  w: design?.reflect?.width,
                  h: design?.reflect?.height,
                },
                fileid: design?.file,
                sceneid: design?.node,
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
                defaultLanguage="dart"
                defaultValue={
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
