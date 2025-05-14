import React from "react";
import { LayerHierarchy } from "components/editor-hierarchy";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { WorkspaceContentPanel } from "layouts/panel";
import { WorkspaceBottomPanelDockLayout } from "layouts/panel/workspace-bottom-panel-dock-layout";
import { WorkspaceContentPanelGridLayout } from "layouts/panel/workspace-content-panel-grid-layout";

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
