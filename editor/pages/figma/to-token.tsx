import React, { useEffect, useState } from "react";
import { canvas } from "components";
import { tokenize } from "@designto/token";
import {
  JsonTree,
  WidgetTree,
} from "@code-editor/devtools/components/visualization/json-visualization/json-tree";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { LayerHierarchy } from "components/editor-hierarchy";
import { WorkspaceContentPanelGridLayout } from "layouts/panel/workspace-content-panel-grid-layout";
import { WorkspaceContentPanel } from "layouts/panel";
import { WorkspaceBottomPanelDockLayout } from "layouts/panel/workspace-bottom-panel-dock-layout";
import { useFigmaNode } from "hooks";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import LoadingLayout from "layouts/loading-overlay";

export default function FigmaToReflectWidgetTokenPage() {
  const design = useFigmaNode({ type: "use-router" });

  if (!design) {
    return <LoadingLayout />;
  }

  //
  MainImageRepository.instance = new RemoteImageRepositories(design.file);
  MainImageRepository.instance.register(
    new ImageRepository(
      "fill-later-assets",
      "grida://assets-reservation/images/"
    )
  );
  //
  //

  let tokenTree;
  if (design.reflect) {
    tokenTree = tokenize(design.reflect);
  }

  console.info("=".repeat(24), "tokenize result", "=".repeat(24));
  console.info("tokenize result >> design.raw", design.raw);
  console.info("tokenize result >> design.figma", design.figma);
  console.info("tokenize result >> design.reflect", design.reflect);
  console.info("tokenize result >> tokenTree", tokenTree);
  console.info("=".repeat(64));

  return (
    <>
      <DefaultEditorWorkspaceLayout
        leftbar={<LayerHierarchy data={design.reflect} />}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <canvas.AsisPreviewFigmaEmbed
              src={{ url: design.url }}
              width="100%"
              height="100%"
            />
          </WorkspaceContentPanel>

          <WorkspaceBottomPanelDockLayout>
            <WorkspaceContentPanel>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                }}
              >
                <div style={{ flex: 1 }}>
                  <WidgetTree data={design.figma} />
                </div>
                <div style={{ flex: 1 }}>
                  <WidgetTree data={design.reflect} />
                </div>
                <div style={{ flex: 1 }}>
                  <JsonTree hideRoot data={tokenTree} />
                </div>
              </div>
            </WorkspaceContentPanel>
          </WorkspaceBottomPanelDockLayout>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
