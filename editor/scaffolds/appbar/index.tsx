import React from "react";
import { EditorAppbarFragments } from "components/editor";
import { useEditorState } from "core/states";
/**
 * a scaffold App bar linked with editor state
 */
export function Appbar() {
  const [state] = useEditorState();

  const isCodeEditorShown = state.selectedNodes.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
      }}
    >
      <EditorAppbarFragments.RightSidebar background={isCodeEditorShown} />
    </div>
  );
}
