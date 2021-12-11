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
import { ReflectSceneNode } from "@design-sdk/figma-node";
import { get_framework_config } from "query/to-code-options-from-query";
import { CodeOptionsControl } from "components/codeui-code-options-control";

export function Editor() {
  const router = useRouter();
  const wstate = useWorkspaceState();
  const [state] = useEditorState();

  const fat = useFigmaAccessToken();
  const [result, setResult] = useState<Result>();
  const [preview, setPreview] = useState<Result>();

  const [framework_config, set_framework_config] = useState(
    wstate.preferences.framework_config
  );
  const preview_runner_framework =
    wstate.preferences.preview_runner_framework_config;
  const enable_components =
    wstate.preferences.enable_preview_feature_components_support;
  const design = state.design?.current;
  const focusid =
    state?.selectedNodes?.length === 1 ? state.selectedNodes[0] : null;
  const focused =
    find_node_by_id_under_entry(focusid, design?.entry) ?? design?.entry;

  // const focusdesign = design?.nodes.find((n) => n.id === focusid);

  useEffect(() => {
    // ------------------------------------------------------------
    // other platforms are not supported yet
    // set image repo for figma platform
    if (state.design) {
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
    }
    // ------------------------------------------------------------
  }, [state.design?.key, fat]);

  useEffect(() => {
    if (focused && framework_config) {
      const input = {
        id: focused.id,
        name: focused.name,
        entry: focused,
        repository: design.repository,
      };
      const build_config = {
        ...config.default_build_configuration,
        disable_components: !enable_components,
      };

      const on_result = (result: Result) => {
        setResult(result);
        if (framework_config.framework == preview_runner_framework.framework) {
          setPreview(result);
        }
      };

      // build code without assets fetch
      designToCode({
        input: input,
        framework: framework_config,
        asset_config: { skip_asset_replacement: true },
        build_config: build_config,
      }).then(on_result);

      // build final code with asset fetch
      designToCode({
        input: input,
        framework: framework_config,
        asset_config: { asset_repository: MainImageRepository.instance },
        build_config: build_config,
      }).then(on_result);
    }
  }, [focused?.id, framework_config?.framework]);

  useEffect(() => {
    if (design) {
      const { id, name } = design.entry;
      const input = {
        id: id,
        name: name,
        entry: design.entry,
      };
      const build_config = {
        ...config.default_build_configuration,
        disable_components: true,
      };
      // ----- for preview -----
      if (framework_config?.framework !== preview_runner_framework.framework) {
        designToCode({
          input: input,
          build_config: build_config,
          framework: preview_runner_framework,
          asset_config: { skip_asset_replacement: true },
        }).then((result) => {
          setPreview(result);
        });

        designToCode({
          input: input,
          build_config: build_config,
          framework: preview_runner_framework,
          asset_config: { asset_repository: MainImageRepository.instance },
        }).then((result) => {
          setPreview(result);
        });
      }
    }
  }, [design?.id]);

  const { code, scaffold, name: componentName } = result ?? {};

  return (
    <DefaultEditorWorkspaceLayout
      backgroundColor={"rgba(37, 37, 38, 1)"}
      leftbar={<EditorSidebar />}
    >
      <WorkspaceContentPanelGridLayout>
        <WorkspaceContentPanel>
          <>
            <EditorAppbarFragments.Canvas />
            {preview ? (
              <PreviewAndRunPanel
                // key={_key_for_preview}
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
            {/* <EditorAppbarFragments.CodeEditor /> */}
            <CodeOptionsControl
              initialPreset={router.query.framework as string}
              fallbackPreset="react_default"
              onUseroptionChange={(o) => {
                set_framework_config(get_framework_config(o.framework));
              }}
            />
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
                      loading: {
                        raw: "Reading design...",
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

const EditorCanvasSkeleton = () => {
  return (
    <PreviewAndRunPanel
      // key={_key_for_preview}
      config={{
        src: "",
        platform: "vanilla",
        componentName: "loading",
        sceneSize: {
          w: 375,
          h: 812,
        },
        initialMode: "run",
        fileid: "loading",
        sceneid: "loading",
        hideModeChangeControls: true,
      }}
    />
  );
};

const CodeEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;

const find_node_by_id_under_entry = (id: string, entry: ReflectSceneNode) => {
  if (!entry) return null;
  if (entry.id === id) {
    return entry;
  }
  if (entry.children) {
    for (const child of entry.children) {
      const found = find_node_by_id_under_entry(id, child);
      if (found) {
        return found;
      }
    }
  }
  return null;
};
