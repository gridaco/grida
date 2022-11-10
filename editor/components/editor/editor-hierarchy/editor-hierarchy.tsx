import React from "react";
import { useEditorState } from "core/states";
import { DesignLayerHierarchy } from "../editor-hierarchy-layers";

export function EditorLayerHierarchy() {
  const [state] = useEditorState();
  const { selectedPage, pages } = state;
  const page = pages.find((p) => p.id == selectedPage);

  switch (page?.type) {
    case "home":
      return <></>;
    case "figma-canvas":
      return <DesignLayerHierarchy />;
    case "code":
      return <></>;
    default:
      return <></>;
  }
}
