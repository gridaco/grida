import React, { useCallback } from "react";
import { WorkspaceContentPanel } from "layouts/panel";
import { useDispatch } from "core/dispatch";
import { Coding } from "./coding";
import { CodeRunnerCanvas } from "./code-runner-canvas";
import { CodeInitialTemplateProvider } from "./code-initial-template-provider";

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
      <Providers>
        <WorkspaceContentPanel
          disableBorder
          overflow={"hidden"}
          resize={{
            right: true,
          }}
          minWidth={100}
        >
          <Coding />
        </WorkspaceContentPanel>
        <WorkspaceContentPanel disableBorder>
          <CodeRunnerCanvas onEnterFullscreen={startFullscreenRunnerMode} />
        </WorkspaceContentPanel>
      </Providers>
    </div>
  );
}

function Providers({ children }: React.PropsWithChildren<{}>) {
  return <CodeInitialTemplateProvider>{children}</CodeInitialTemplateProvider>;
}
