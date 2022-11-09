import React, { useCallback } from "react";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layouts/panel";
import { EditorSidebar } from "components/editor";
import { EditorState, useEditorState } from "core/states";
import { Canvas } from "scaffolds/canvas";
import { Code, CodeRunnerCanvas } from "scaffolds/code";
import { Inspector } from "scaffolds/inspector";
import { EditorHome } from "scaffolds/editor-home";
import { EditorSkeleton } from "./skeleton";
import { colors } from "theme";
import { useEditorSetupContext } from "./setup";
import { Dialog } from "@mui/material";
import { FullScreenPreview } from "scaffolds/preview-full-screen";
import { useDispatch } from "core/dispatch";
import styled from "@emotion/styled";

export function Editor() {
  const [state] = useEditorState();
  const { loading } = useEditorSetupContext();

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
        // appbar={<EditorAppbar />}
        leftbar={{
          _type: "resizable",
          minWidth: 240,
          maxWidth: 600,
          children: <EditorSidebar />,
        }}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel flex={6}>
            <PageView key={_refreshkey} />
          </WorkspaceContentPanel>
          {/* <SideRightPanel /> */}
          <WorkspaceContentPanel
            overflow="hidden"
            flex={1}
            resize={{
              left: true,
            }}
            minWidth={300}
            zIndex={1}
            hidden={state.mode.value !== "design"}
            backgroundColor={colors.color_editor_bg_on_dark}
          >
            <SideRightPanel />
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

function ModeDesign() {
  const [state] = useEditorState();
  const { selectedPage } = state;

  switch (selectedPage) {
    case "home":
      return <EditorHome />;
    default:
      return <Canvas />;
  }
}

function ModeCode() {
  const dispatch = useDispatch();

  const startFullscreenRunnerMode = useCallback(
    () =>
      dispatch({
        type: "mode",
        mode: "run",
      }),
    [dispatch]
  );

  const endCodeSession = useCallback(
    () =>
      dispatch({
        type: "mode",
        mode: "design",
      }),
    [dispatch]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <WorkspaceContentPanel
        disableBorder
        resize={{
          right: true,
        }}
      >
        <div
          style={{
            paddingTop: 48,
          }}
        >
          <Code />
        </div>
      </WorkspaceContentPanel>
      <WorkspaceContentPanel disableBorder>
        <CodeRunnerCanvas
          onClose={endCodeSession}
          onEnterFullscreen={startFullscreenRunnerMode}
        />
      </WorkspaceContentPanel>
    </div>
  );
}

function SideRightPanel() {
  const [state] = useEditorState();

  switch (state.mode.value) {
    case "code":
      return <></>;
    case "design":
      return <Inspector />;
  }
}

function PageView() {
  const [state] = useEditorState();
  const { mode } = state;

  const _Body = useCallback(
    ({ mode }: { mode: EditorState["mode"]["value"] }) => {
      switch (mode) {
        case "code": {
          return <ModeCode />;
        }
        case "design": {
          return <ModeDesign />;
        }
      }
    },
    [mode.value]
  );

  return (
    <>
      <ModeRunnerOverlay />
      <_Body mode={mode.value !== "run" ? mode.value : mode.last ?? "design"} />
    </>
  );
}

function ModeRunnerOverlay() {
  const dispatch = useDispatch();
  const [state] = useEditorState();
  const exitSession = useCallback(
    () =>
      dispatch({
        type: "mode",
        mode: "goback",
      }),
    [dispatch]
  );

  return (
    <Dialog fullScreen onClose={exitSession} open={state.mode.value == "run"}>
      <FullScreenPreview onClose={exitSession} />
    </Dialog>
  );
}
