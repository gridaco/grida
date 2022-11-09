import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { WorkspaceContentPanel } from "layouts/panel";
import { useDispatch } from "core/dispatch";
import { Coding } from "./coding";
import { CodeRunnerCanvas } from "./code-runner-canvas";

export function Code() {
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
        mode: "goback",
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
          <Coding />
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
