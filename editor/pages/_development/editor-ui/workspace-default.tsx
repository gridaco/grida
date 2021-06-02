import React from "react";
import { LayerHierarchy } from "../../../components/editor-hierarchy";
import { DefaultEditorWorkspaceLayout } from "../../../layout/default-editor-workspace-layout";
import { WorkspaceContentPanel } from "../../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../../layout/panel/workspace-bottom-panel-dock-layout";
import { WorkspaceContentPanelGridLayout } from "../../../layout/panel/workspace-content-panel-grid-layout";

export default function WorkspaceDefaultLayoutPage_DEV() {
  return (
    <>
      <DefaultEditorWorkspaceLayout
        leftbar={<LayerHierarchy data={undefined} />}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <p style={{ height: 1000 }}>Long content</p>
          </WorkspaceContentPanel>
          <WorkspaceContentPanel>
            <p>2</p>
          </WorkspaceContentPanel>
          <WorkspaceBottomPanelDockLayout>
            <p>docked</p>
          </WorkspaceBottomPanelDockLayout>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
