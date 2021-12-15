import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
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
import { get_framework_config } from "query/to-code-options-from-query";
import { CodeOptionsControl } from "components/codeui-code-options-control";
import { DesignInput } from "@designto/config/input";
import { Canvas } from "scaffolds/canvas";
import {
  find_node_by_id_under_entry,
  find_node_by_id_under_inpage_nodes,
} from "utils/design-query";
import { vanilla_presets } from "@grida/builder-config-preset";
import { EditorSkeleton } from "./skeleton";
import { MonacoEmptyMock } from "components/code-editor/monaco-mock-empty";
import { colors } from "theme";

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

  const enable_components =
    wstate.preferences.enable_preview_feature_components_support;

  const thisPageNodes = state.selectedPage
    ? state.design.pages.find((p) => p.id == state.selectedPage).children
    : null;

  const targetId =
    state?.selectedNodes?.length === 1 ? state.selectedNodes[0] : null;

  const container_of_target =
    find_node_by_id_under_inpage_nodes(targetId, thisPageNodes) || null;

  const root = thisPageNodes
    ? container_of_target && DesignInput.fromDesign(container_of_target)
    : state.design?.input;

  const targetted =
    find_node_by_id_under_entry(targetId, root?.entry) ?? root?.entry;

  const targetStateRef = useRef();
  //@ts-ignore
  targetStateRef.current = targetted;

  useEffect(() => {
    // ------------------------------------------------------------
    // other platforms are not supported yet
    // set image repo for figma platform
    if (state.design) {
      MainImageRepository.instance = new RemoteImageRepositories(
        state.design.key,
        {
          authentication: fat,
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
  }, [state.design?.key, fat.accessToken]);

  const on_result = (result: Result) => {
    //@ts-ignore
    if (result.id == targetStateRef?.current?.id) {
      setResult(result);
    }
  };

  const on_preview_result = (result: Result) => {
    //@ts-ignore
    if (result.id == targetStateRef?.current?.id) {
      setPreview(result);
    }
  };

  useEffect(() => {
    const __target = targetted;
    if (__target && framework_config) {
      const _input = {
        id: __target.id,
        name: __target.name,
        entry: __target,
        repository: root.repository,
      };
      const build_config = {
        ...config.default_build_configuration,
        disable_components: !enable_components,
      };

      // build code without assets fetch
      designToCode({
        input: _input,
        framework: framework_config,
        asset_config: { skip_asset_replacement: true },
        build_config: build_config,
      }).then(on_result);

      // build final code with asset fetch
      designToCode({
        input: root,
        framework: framework_config,
        asset_config: { asset_repository: MainImageRepository.instance },
        build_config: build_config,
      }).then(on_result);
    }
  }, [targetted?.id, framework_config?.framework]);

  useEffect(
    () => {
      const __target = targetted; // root.entry;
      if (__target) {
        const _input = {
          id: __target.id,
          name: __target.name,
          entry: __target,
        };
        const build_config = {
          ...config.default_build_configuration,
          disable_components: true,
        };

        // ----- for preview -----
        designToCode({
          input: _input,
          build_config: build_config,
          framework: vanilla_presets.vanilla_default,
          asset_config: {
            skip_asset_replacement: false,
            asset_repository: MainImageRepository.instance,
            custom_asset_replacement: {
              type: "static",
              resource:
                "https://bridged-service-static.s3.us-west-1.amazonaws.com/placeholder-images/image-placeholder-bw-tile-100.png",
            },
          },
        }).then(on_preview_result);

        designToCode({
          input: root,
          build_config: build_config,
          framework: vanilla_presets.vanilla_default,
          asset_config: { asset_repository: MainImageRepository.instance },
        }).then(on_preview_result);
      }
    },
    [targetted?.id]
    // [root?.id]
  );

  const { code, scaffold, name: componentName } = result ?? {};
  const _initially_loaded = state.design?.pages?.length > 0;
  const _initial_load_progress =
    [!!state.design?.input, !!result, state.design?.pages?.length > 0].filter(
      Boolean
    ).length / 3;

  return (
    <>
      {!_initially_loaded && (
        <EditorSkeleton percent={_initial_load_progress + 0.2} />
      )}
      <DefaultEditorWorkspaceLayout
        backgroundColor={colors.color_editor_bg_on_dark}
        leftbar={<EditorSidebar />}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel flex={6}>
            <Canvas
              preview={preview}
              fileid={state?.design?.key}
              sceneid={root?.id}
              originsize={{
                width: root?.entry?.width,
                height: root?.entry?.height,
              }}
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel flex={4}>
            <CodeEditorContainer>
              <EditorAppbarFragments.CodeEditor />
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
                          raw: "\n".repeat(100),
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
                      key={root.id}
                      file={state.design.key}
                      node={root.id}
                    />
                    <br />
                    {(root.entry.origin === "INSTANCE" ||
                      root.entry.origin === "COMPONENT") && (
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
                    <WidgetTree data={root.entry} />
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
    </>
  );
}

const CodeEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;
