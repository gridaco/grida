import React from "react";
import { WorkspaceWarmupAction } from "core/actions";
import { NextRouter } from "next/router";
import { WorkspaceFigmaAuthProvider } from "./figma-auth";

export function SetupWorkspace({
  router,
  children,
  dispatch,
}: React.PropsWithChildren<{
  router: NextRouter;
  dispatch: (action: WorkspaceWarmupAction) => void;
}>) {
  return (
    <>
      <WorkspaceFigmaAuthProvider dispatch={dispatch}>
        {children}
      </WorkspaceFigmaAuthProvider>
    </>
  );
}
