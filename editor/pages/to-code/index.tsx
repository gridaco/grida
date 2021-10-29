import React, { useEffect, useState } from "react";
import { designToCode, Result } from "@designto/code";
import { useDesign } from "../../query-hooks";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";
import { CodeEditor } from "../../components/code-editor";
import {
  react_presets,
  flutter_presets,
  vanilla_presets,
} from "@grida/builder-config-preset";
import { useRouter } from "next/router";
import { ParsedUrlQuery } from "querystring";
import { config, FrameworkConfig, output } from "@designto/config";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import LoadingLayout from "../../layout/loading-overlay";
import { DesignInput } from "@designto/config/input";
import { ClearRemoteDesignSessionCache } from "../../components/clear-remote-design-session-cache";
import { WidgetTree } from "../../components/visualization/json-visualization/json-tree";

export default function DesignToCodeUniversalPage() {
  const router = useRouter();
  const design = useDesign();
  const [result, setResult] = useState<Result>();
  const [preview, setPreview] = useState<Result>();

  const framework_config = get_framework_config_from_query(router.query);
  const preview_runner_framework = get_preview_runner_framework(router.query);
  const enable_components = get_enable_components_config_from_query(
    router.query
  );

  useEffect(() => {
    if (design) {
      const { reflect, raw } = design;
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
        input: DesignInput.fromApiResponse({ entry: reflect, raw }),
        framework: framework_config,
        asset_config: { asset_repository: MainImageRepository.instance },
        build_config: {
          ...config.default_build_configuration,
          disable_components: !enable_components,
        },
      }).then((result) => {
        setResult(result);
        if (framework_config.framework == preview_runner_framework.framework) {
          setPreview(result);
        }
      });
      // ----- for preview -----
      if (framework_config.framework !== preview_runner_framework.framework) {
        designToCode({
          input: {
            id: id,
            name: name,
            entry: reflect,
          },
          build_config: {
            ...config.default_build_configuration,
            disable_components: true,
          },
          framework: preview_runner_framework,
          asset_config: { asset_repository: MainImageRepository.instance },
        }).then((result) => {
          setPreview(result);
        });
      }
    }
  }, [design]);

  if (!result || !preview) {
    return <LoadingLayout />;
  }

  const { code, scaffold, name: componentName } = result;
  console.log("design to code result::", result);

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
                src: preview.scaffold.raw,
                platform: preview_runner_framework.framework,
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
              <CodeEditor
                // key={code.raw}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                files={{
                  "index.tsx": {
                    raw: code
                      ? code.raw
                      : "// No input design provided to be converted..",
                    language: framework_config.language,
                    name: "index.tsx",
                  },
                }}
              />
            </InspectionPanelContentWrap>
          </WorkspaceContentPanel>
          <WorkspaceBottomPanelDockLayout resizable>
            <WorkspaceContentPanel>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                }}
              >
                <div style={{ flex: 1 }}>
                  <ClearRemoteDesignSessionCache
                    key={design.url}
                    url={design.url}
                  />
                  <br />
                  {(design.reflect.origin === "INSTANCE" ||
                    design.reflect.origin === "COMPONENT") && (
                    <button
                      onClick={() => {
                        router.push({
                          pathname: "/figma/inspect-component",
                          query: router.query,
                        });
                      }}
                    >
                      inspect component
                    </button>
                  )}
                </div>

                <div style={{ flex: 2 }}>
                  <WidgetTree data={design.reflect} />
                </div>
                <div style={{ flex: 2 }}>
                  <WidgetTree data={result.widget} />
                </div>
              </div>
            </WorkspaceContentPanel>
          </WorkspaceBottomPanelDockLayout>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}

function get_enable_components_config_from_query(
  query: ParsedUrlQuery
): boolean {
  const enable_components = query["components"];
  if (enable_components) {
    return enable_components === "true";
  }
  return false;
}

function get_framework_config_from_query(query: ParsedUrlQuery) {
  const framework = query.framework as string;
  return get_framework_config(framework);
}

function get_framework_config(framework: string) {
  switch (framework) {
    case "react":
    case "react_default":
    case "react-default":
    case "react.default":
      return react_presets.react_default;
    case "react-with-styled-components":
      return react_presets.react_with_styled_components;
    case "react-with-emotion-styled":
      return react_presets.react_with_emotion_styled;
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

function get_preview_runner_framework(query: ParsedUrlQuery) {
  const preview = query.preview as string;
  return get_framework_config(
    preview || get_framework_config_from_query(query).framework
  );
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
