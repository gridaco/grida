import React from "react";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layouts/panel";
import { EditorSidebar } from "components/editor";
import { useEditorState } from "core/states";
import { Canvas } from "scaffolds/canvas";
import { CodeSegment } from "scaffolds/code";
import { EditorSkeleton } from "./skeleton";
import { colors } from "theme";
import { Appbar } from "scaffolds/appbar";

export function Editor({
  loading = false,
}: {
  /**
   * explicitly set loading to block uesr interaction.
   */
  loading?: boolean;
}) {
  const [state] = useEditorState();

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
        leftbar={{
          _type: "resizable",
          minWidth: 240,
          maxWidth: 600,
          children: <EditorSidebar />,
        }}
        appbar={<Appbar />}
        // rightbar={<Inspector />}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel flex={6}>
            <Canvas key={_refreshkey} />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel
            hidden={state.selectedNodes.length === 0}
            overflow="hidden"
            flex={4}
            resize={{
              left: true,
            }}
            minWidth={300}
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
