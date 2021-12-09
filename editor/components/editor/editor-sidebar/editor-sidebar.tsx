import { SideNavigation } from "components/side-navigation";
import React from "react";
import { EditorAppbarFragments } from "../editor-appbar";
import { EditorLayerHierarchy } from "../editor-layer-hierarchy";

export function EditorSidebar() {
  return (
    <SideNavigation>
      <EditorAppbarFragments.Sidebar />
      <EditorLayerHierarchy />
    </SideNavigation>
  );
}
