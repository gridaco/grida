import React from "react";
import { useEditorState } from "core/states";
import { DesignLayerHierarchy } from "../editor-hierarchy-layers";
import { CodeFilesHierarchyTree } from "../editor-hierarchy-code-files";
import { DashboardHierarchy } from "@code-editor/dashboard";

export function EditorHierarchy() {
  const [state] = useEditorState();
  const { selectedPage, pages, isolation } = state;

  if (isolation.isolated) {
    return <DesignLayerHierarchy rootNodeIDs={[isolation.node]} expandAll />;
  }

  const page = pages.find((p) => p.id == selectedPage);

  switch (page?.type) {
    case "home":
      return <DashboardHierarchy />;
    case "figma-canvas":
      return <DesignLayerHierarchy />;
    case "craft":
      return <DesignLayerHierarchy />;
    case "code":
      return <CodeFilesHierarchyTree />;
    default:
      return <></>;
  }
}
