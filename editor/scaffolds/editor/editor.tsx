import React from "react";
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

export function Editor() {
  const wstate = useWorkspaceState();
  const [state] = useEditorState();

  const _initially_loaded = state.design?.pages?.length > 0;
  const _initial_load_progress =
    [!!state.design?.input, state.design?.pages?.length > 0].filter(Boolean)
      .length / 2;

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
            <Canvas fileid={state?.design?.key} />
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
