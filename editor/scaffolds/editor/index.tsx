import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { PreviewAndRunPanel } from "components/preview-and-run";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layouts/panel";
import { WorkspaceBottomPanelDockLayout } from "layouts/panel/workspace-bottom-panel-dock-layout";
import { CodeEditor } from "components/code-editor";
import { ClearRemoteDesignSessionCache } from "components/clear-remote-design-session-cache";
import { WidgetTree } from "components/visualization/json-visualization/json-tree";
import { EditorAppbarFragments, EditorSidebar } from "components/editor";
import { useEditorState, useWorkspaceState } from "core/states";
import { designToCode, Result } from "@designto/code";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import { config } from "@designto/config";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import { personal } from "@design-sdk/figma-auth-store";
import { useFigmaAccessToken } from "hooks";

export function Editor() {
  const router = useRouter();
  const wstate = useWorkspaceState();
  const [state] = useEditorState();

  const fat = useFigmaAccessToken();
  const [result, setResult] = useState<Result>();
  const [preview, setPreview] = useState<Result>();

  const framework_config = wstate.preferences.framework_config;
  const preview_runner_framework =
    wstate.preferences.preview_runner_framework_config;
  const enable_components =
    wstate.preferences.enable_preview_feature_components_support;
  const design = state.design?.current;

  useEffect(() => {
    if (design) {
      // const { reflect, raw } = design;
      const { id, name } = design.entry;
      // ------------------------------------------------------------
      // other platforms are not supported yet
      // set image repo for figma platform
      MainImageRepository.instance = new RemoteImageRepositories(
        state.design.key,
        {
          authentication: {
            accessToken: fat,
            personalAccessToken: personal.get_safe(),
          },
        }
      );
      MainImageRepository.instance.register(
        new ImageRepository(
          "fill-later-assets",
          "grida://assets-reservation/images/"
        )
      );
      // ------------------------------------------------------------
      designToCode({
        input: design,
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
  }, [design, framework_config?.framework]);

  useEffect(() => {
    if (design) {
      const { id, name } = design.entry;
      // ----- for preview -----
      if (framework_config.framework !== preview_runner_framework.framework) {
        designToCode({
          input: {
            id: id,
            name: name,
            entry: design.entry,
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
  const _key_for_preview = design?.id;

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
                    w: design.entry?.width,
                    h: design.entry?.height,
                  },
                  initialMode: "run",
                  fileid: state.design.key,
                  sceneid: design.id,
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
        {wstate.preferences.debug_mode && (
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
                    key={design.id}
                    file={state.design.key}
                    node={design.id}
                  />
                  <br />
                  {(design.entry.origin === "INSTANCE" ||
                    design.entry.origin === "COMPONENT") && (
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
                  <WidgetTree data={design.entry} />
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
