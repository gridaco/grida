import React, { useEffect } from "react";
import { useFigmaAccessToken } from "hooks/use-figma-access-token";
import { initialize } from "scaffolds/preview-canvas/canvas-preview-worker-messenger";
import { useEditorState } from "core/states";

export function EditorCanvasPreviewProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [state] = useEditorState();
  const fat = useFigmaAccessToken();

  useEffect(() => {
    if (
      state.design.key &&
      (fat.personalAccessToken || !fat.accessToken.loading)
    ) {
      initialize(state.design.key, fat);
    }
  }, [fat, state.design.key]);

  return <>{children}</>;
}
