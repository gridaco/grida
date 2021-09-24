import React, { useEffect, useState } from "react";
import { designToCode } from "@designto/code";
import { useDesign } from "../../query-hooks";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";
import { MonacoEditor } from "../../components/code-editor";
import {
  react_presets,
  flutter_presets,
  vanilla_presets,
} from "@grida/builder-config-preset";
import { useRouter } from "next/router";
import { ParsedUrlQuery } from "querystring";
import { FrameworkConfig, output } from "@designto/config";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";

export default function DesignToCodeUniversalPage() {
  const router = useRouter();
  const design = useDesign();
  const [result, setResult] = useState<output.ICodeOutput>();

  const framework_config = get_framework_config_from_query(router.query);

  useEffect(() => {
    if (design) {
      const { reflect } = design;
      const { id, name } = reflect;
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
      designToCode({
        input: {
          id: id,
          name: name,
          design: reflect,
        },
        framework: framework_config,
        asset_repository: MainImageRepository.instance,
      }).then((result) => {
        setResult(result);
      });
    }
  }, [design]);

  if (!result) {
    return <>Loading..</>;
  }

  const { code, name: componentName } = result;

  const runner_platform = get_runner_platform(framework_config);
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
              key={design.url ?? design.reflect?.id}
              config={{
                src: code.raw,
                platform: runner_platform,
                componentName: componentName,
                sceneSize: {
                  w: design.reflect?.width,
                  h: design.reflect?.height,
                },
                initialMode: "run",
                fileid: design.file,
                sceneid: design.node,
              }}
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel key={design.node}>
            <InspectionPanelContentWrap>
              <MonacoEditor
                key={code.raw}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                defaultLanguage={framework_config.language}
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

function get_framework_config_from_query(query: ParsedUrlQuery) {
  const framework = query.framework as string;
  switch (framework) {
    case "react":
    case "react_default":
    case "react-default":
    case "react.default":
      return react_presets.react_default;
    case "flutter":
    case "flutter_default":
    case "flutter-default":
    case "flutter.default":
      return flutter_presets.flutter_default;
    case "vanilla":
    case "vanilla-default":
    case "vanilla.default":
      return vanilla_presets.vanilla_default;
    default:
      return react_presets.react_default;
  }
}

function get_runner_platform(config: FrameworkConfig) {
  switch (config.framework) {
    case "react":
      return "react";
    case "flutter":
      return "flutter";
    case "flutter":
      return "flutter";
    case "vanilla":
      return "vanilla";
    default:
      return "vanilla";
  }
}

const InspectionPanelContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
