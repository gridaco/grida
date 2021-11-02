import React, { useEffect, useState } from "react";
import { designTo } from "@designto/code";
import styled from "@emotion/styled";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import { output } from "@designto/config";
import { tokenize } from "@designto/token";
import { utils_dart } from "../../utils";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import { useDesign } from "../../query-hooks";
import { CodeEditor, MonacoEditor } from "../../components/code-editor";
import LoadingLayout from "../../layout/loading-overlay";

export default function FigmaToFlutterPage() {
  const design = useDesign({ type: "use-router" });
  const [result, setResult] = useState<output.ICodeOutput>();

  useEffect(() => {
    if (design) {
      const { reflect, url, node, file } = design;

      // ------------------------------------------------------------
      // other platforms are not supported yet
      // set image repo for figma platform
      MainImageRepository.instance = new RemoteImageRepositories(design.file);
      MainImageRepository.instance.register(
        new ImageRepository(
          "fill-later-assets",
          "grida://assets-reservation/images/"
        )
      );
      // ------------------------------------------------------------
      designTo
        .flutter({
          input: {
            widget: tokenize(reflect),
          },
          asset_config: { asset_repository: MainImageRepository.instance },
        })
        .then(setResult);
    }
  }, [design]);

  if (!result) {
    return <LoadingLayout />;
  }

  const widgetCode = utils_dart.format(result.code.raw);
  const rootAppCode = utils_dart.format(result.scaffold.raw);
  console.log("flutter result", result);

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
              <CodeEditor
                // key={widgetCode}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                files={{
                  "index.tsx": {
                    raw: widgetCode
                      ? widgetCode
                      : "// No input design provided to be converted..",
                    language: "dart",
                    name: "index.tsx",
                  },
                }}
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
