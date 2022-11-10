import React from "react";
import styled from "@emotion/styled";
import { SideNavigation } from "components/side-navigation";
import { EditorAppbarFragments } from "../editor-appbar";
import { EditorLayerHierarchy } from "../editor-hierarchy";
import { EditorPagesList } from "../editor-pages-list";
import { Resizable } from "layout/resizable";

export function EditorSidebar() {
  return (
    <SideNavigation>
      <EditorAppbarFragments.Sidebar />
      <SidebarSegment flex={"none"}>
        <Resizable
          enable={{ bottom: true }}
          minHeight={100}
          handleClasses={{
            bottom: "handle",
          }}
        >
          <EditorPagesList />
        </Resizable>
      </SidebarSegment>
      <SidebarSegment flex={1}>
        <EditorLayerHierarchy />
      </SidebarSegment>
    </SideNavigation>
  );
}

const SidebarSegment = styled.div<{ flex: number | "none" }>`
  flex: ${(p) => p.flex};
  overflow-y: scroll;
`;
