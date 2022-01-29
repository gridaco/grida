import React, { useEffect, useRef, useState } from "react";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layouts/panel";
import { WorkspaceBottomPanelDockLayout } from "layouts/panel/workspace-bottom-panel-dock-layout";
import { EditorSidebar } from "components/editor";
import { useEditorState, useWorkspaceState } from "core/states";

import { Canvas } from "scaffolds/canvas";

import { EditorSkeleton } from "./skeleton";
import { colors } from "theme";
import { Debugger } from "@code-editor/debugger";
import { CodeSegment } from "scaffolds/code";

import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import { useFigmaAccessToken } from "hooks";

export function Editor({
  loading = false,
}: {
  /**
   * explicitly set loading to block uesr interaction.
   */
  loading?: boolean;
}) {
  const wstate = useWorkspaceState();
  const [state] = useEditorState();

  const fat = useFigmaAccessToken();

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

  const _initially_loaded = state.design?.pages?.length > 0;
  const _initial_load_progress =
    [!!state.design?.input, state.design?.pages?.length > 0, !loading].filter(
      Boolean
    ).length /
      3 +
    0.2;

  // this key is used for force re-rendering canvas after the whole file is fetched.
  const _refreshkey = loading || !_initially_loaded ? "1" : "0";

  return (
    <>
      {(loading || !_initially_loaded) && (
        <EditorSkeleton percent={_initial_load_progress * 100} />
      )}
      <DefaultEditorWorkspaceLayout
        backgroundColor={colors.color_editor_bg_on_dark}
        leftbar={<EditorSidebar />}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel flex={6}>
            <Canvas key={_refreshkey} />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel
            hidden={state.selectedNodes.length === 0}
            flex={4}
            zIndex={1}
            backgroundColor={colors.color_editor_bg_on_dark}
          >
            <CodeSegment />
          </WorkspaceContentPanel>
          {/* {wstate.preferences.debug_mode && (
            <WorkspaceBottomPanelDockLayout resizable>
              <WorkspaceContentPanel disableBorder>
                <Debugger
                  id={root?.id}
                  file={state?.design?.key}
                  type={root?.entry?.origin}
                  entry={root?.entry}
                  widget={result?.widget}
                />
              </WorkspaceContentPanel>
            </WorkspaceBottomPanelDockLayout>
          )} */}
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
