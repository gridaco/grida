import React, { useCallback } from "react";
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
        overflow={"hidden"}
        resize={{
          right: true,
        }}
        minWidth={100}
      >
        <div>
          <Coding />
        </div>
      </WorkspaceContentPanel>
      <WorkspaceContentPanel disableBorder>
        <CodeRunnerCanvas onEnterFullscreen={startFullscreenRunnerMode} />
      </WorkspaceContentPanel>
    </div>
  );
}
