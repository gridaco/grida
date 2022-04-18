import React from "react";
import { EditorAppbarFragments } from "components/editor";
/**
 * a scaffold App bar linked with editor state
 */
export function Appbar() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
      }}
    >
      <EditorAppbarFragments.Sidebar />
      <EditorAppbarFragments.Canvas />
      <EditorAppbarFragments.CodeEditor />
    </div>
  );
}
