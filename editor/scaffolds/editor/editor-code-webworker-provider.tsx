import React, { useEffect } from "react";
import { useEditorState, useWorkspaceState } from "core/states";
import { initialize } from "../code/code-worker-messenger";

/**
 * d2c codegen with webworker provider
 * @returns
 */
export function EditorCodeWebworkerProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [state] = useEditorState();
  const wssate = useWorkspaceState();

  useEffect(() => {
    if (state.design?.key) {
      initialize(
        {
          filekey: state.design.key,
          authentication: wssate.figmaAuthentication,
        },
        () => {
          //
        }
      );
    }
  }, [state.design?.key]);

  return <>{children}</>;
}
