import React, { useCallback } from "react";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layouts/panel";
import { EditorSidebar } from "components/editor";
import { EditorState, useEditorState } from "core/states";
import { EditorCraftCanvas, EditorFigmaCanvas } from "scaffolds/canvas";
import { Inspector } from "scaffolds/inspector";
import { EditorHome } from "@code-editor/dashboard";
import { EditorIsolatedInspection } from "@code-editor/isolated-inspection";
import { EditorSkeleton } from "./skeleton";
import { colors } from "theme";
import { useEditorSetupContext } from "./setup";
import { Dialog } from "@mui/material";
import { FullScreenPreview } from "scaffolds/preview-full-screen";
import { useDispatch } from "core/dispatch";
import { Code } from "scaffolds/code";
import { CraftInspector } from "scaffolds/inspector/inspector-craft";

export function Editor() {
  const [state] = useEditorState();
  const { loading, progress } = useEditorSetupContext();

  const initiallyLoaded = progress > 0;
  // this key is used for force re-rendering canvas after the whole file is fetched.
  const _refreshkey = loading || !initiallyLoaded ? "1" : "0";

  return (
    <>
      {(loading || !initiallyLoaded) && (
        <EditorSkeleton percent={progress * 100} />
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
            hidden={
              state.mode.value !== "design" && state.mode.value !== "craft"
            }
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
                  controls={
                    <>
                     <ClearRemoteDesignSessionCache key={id} file={file} node={id} />
                      <br />
                      {(type === "INSTANCE" || type === "COMPONENT") && (
                        <Link
                          href={{
                            pathname: "/figma/inspect-component",
                            query: {
                              // e.g. https://www.figma.com/file/iypAHagtcSp3Osfo2a7EDz/engine?node-id=3098%3A4097
                              design: `https://www.figma.com/file/${file}/?node-id=${id}`,
                            },
                          }}
                        >
                          inspect component
                        </Link>
                      )}
                    </>
                  }
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
  const { selectedPage, isolation } = state;
  const { isolated } = isolation;

  if (isolated) {
    return <ModeIsolateDesign />;
  }

  switch (selectedPage) {
    case "home":
      return <EditorHome />;
    default:
      return <EditorFigmaCanvas />;
  }
}

function ModeCraft() {
  const [state] = useEditorState();

  return <EditorCraftCanvas />;
}

function ModeCode() {
  return <Code />;
}

function ModeIsolateDesign() {
  return <EditorIsolatedInspection />;
}

function SideRightPanel() {
  const [state] = useEditorState();

  switch (state.mode.value) {
    case "code":
      return <></>;
    case "design":
      return <Inspector />;
    case "craft":
      return <CraftInspector />;
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
        case "craft": {
          return <ModeCraft />;
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
