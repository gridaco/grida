import React, { useEffect, useState } from "react";
import { designToCode, Result } from "@designto/code";
import { useDesign, useFigmaAccessToken } from "hooks";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { PreviewAndRunPanel } from "components/preview-and-run";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layouts/panel";
import { WorkspaceBottomPanelDockLayout } from "layouts/panel/workspace-bottom-panel-dock-layout";
import { CodeEditor } from "components/code-editor";
import { useRouter } from "next/router";
import { config } from "@designto/config";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import LoadingLayout from "layouts/loading-overlay";
import { DesignInput } from "@designto/config/input";
import { ClearRemoteDesignSessionCache } from "components/clear-remote-design-session-cache";
import { WidgetTree } from "components/visualization/json-visualization/json-tree";
import { personal } from "@design-sdk/figma-auth-store";
import { CodeOptionsControl } from "components/codeui-code-options-control";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import {
  get_enable_components_config_from_query,
  get_framework_config,
  get_framework_config_from_query,
  get_preview_runner_framework,
} from "core/to-code-options-from-query";
import {
  EditorAppbar,
  EditorAppbarFragments,
  EditorSidebar,
} from "components/editor";

function DesignToCodeUniversalPage() {
  const router = useRouter();
  const design = useDesign({ type: "use-router", router: router });
  const isDebug = router.query.debug;
  const [result, setResult] = useState<Result>();
  const [preview, setPreview] = useState<Result>();

  const [framework_config, set_framework_config] = useState(
    get_framework_config_from_query(router.query)
  );
  const preview_runner_framework = get_preview_runner_framework(router.query);
  const enable_components = get_enable_components_config_from_query(
    router.query
  );

  const fat = useFigmaAccessToken();

  useEffect(() => {
    if (design) {
      const { reflect, raw } = design;
      const { id, name } = reflect;
      // ------------------------------------------------------------
      // other platforms are not supported yet
      // set image repo for figma platform
      MainImageRepository.instance = new RemoteImageRepositories(design.file, {
        authentication: {
          accessToken: fat,
          personalAccessToken: personal.get_safe(),
        },
      });
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
    }
  }, [design, framework_config.framework]);

  useEffect(() => {
    if (design) {
      const { reflect, raw } = design;
      const { id, name } = reflect;
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

  const { code, scaffold, name: componentName } = result ?? {};
  const _key_for_preview = design?.url ?? design?.reflect?.id;

  return (
    <DefaultEditorWorkspaceLayout
      backgroundColor={"rgba(37, 37, 38, 1)"}
      leftbar={<EditorSidebar />}
    >
      <WorkspaceContentPanelGridLayout>
        <WorkspaceContentPanel>
          <>
            <EditorAppbarFragments.Canvas />
            {_key_for_preview && preview ? (
              <PreviewAndRunPanel
                key={_key_for_preview}
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
                  hideModeChangeControls: true,
                }}
              />
            ) : (
              <EditorCanvasSkeleton />
            )}
          </>
        </WorkspaceContentPanel>
        <WorkspaceContentPanel backgroundColor={"rgba(30, 30, 30, 1)"}>
          <CodeEditorContainer>
            <EditorAppbarFragments.CodeEditor />
            {/* <CodeOptionsControl
              initialPreset={router.query.framework as string}
              fallbackPreset="react_default"
              onUseroptionChange={(o) => {
                set_framework_config(get_framework_config(o.framework));
              }}
            /> */}
            <CodeEditor
              key={code?.raw}
              height="100vh"
              options={{
                automaticLayout: true,
              }}
              files={
                code
                  ? {
                      "index.tsx": {
                        raw: code.raw,
                        language: framework_config.language,
                        name: "index.tsx",
                      },
                    }
                  : {
                      "loading.txt": {
                        raw: "// No input design provided to be converted..",
                        language: "text",
                        name: "loading",
                      },
                    }
              }
            />
          </CodeEditorContainer>
        </WorkspaceContentPanel>
        {isDebug && (
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
        )}
      </WorkspaceContentPanelGridLayout>
    </DefaultEditorWorkspaceLayout>
  );
}

const EditorCanvasSkeleton = styled.div`
  width: 100%;
  height: 100%;
  color: red;
`;

const CodeEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;

export default function Page() {
  return (
    <SigninToContinueBannerPrmoptProvider>
      <DesignToCodeUniversalPage />
    </SigninToContinueBannerPrmoptProvider>
  );
}
