import React, { useEffect } from "react";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";
import { useEditorState } from "core/states";
import { initialize } from "../code/canvas-preview-worker-messenger";

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
  const fat = useFigmaAccessToken();

  useEffect(() => {
    if (
      state.design?.key &&
      (fat.personalAccessToken || !fat.accessToken.loading)
    ) {
      const authentication = {
        personalAccessToken: fat.personalAccessToken,
        accessToken: fat.accessToken.token,
      };
      initialize({ filekey: state.design.key, authentication }, () => {
        //
      });
    }
  }, [fat.personalAccessToken, fat.accessToken.token, state.design?.key]);

  return <>{children}</>;
}
