import { ReflectSceneNode } from "@design-sdk/figma-node";
import { tokenize } from "@designto/token";
import React from "react";
import { canvas } from "../../components";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import { visualize_node } from "../../components/visualization";
import {
  JsonTree,
  WidgetTree,
} from "../../components/visualization/json-visualization/json-tree";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import LoadingLayout from "../../layout/loading-overlay";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";
import { useDesign } from "../../query-hooks";

export default function InspectComponent() {
  //
  const design = useDesign();
  if (!design) {
    return <LoadingLayout />;
  }

  if (design.figma.type !== "COMPONENT" && design.figma.type !== "INSTANCE") {
    return (
      <div style={{ margin: 60 }}>
        <h2>Not a component</h2>
        <p>
          This page cannot hanlde other types than <code>COMPONENT</code> or
          <code>INSTANCE</code>
        </p>
        <p>
          Givven was: <code>{design.figma.type}</code>
        </p>
      </div>
    );
  }

  const { node, reflect, raw, remote, figma, url } = design;
  //

  let tokenTree;
  if (design.reflect) {
    tokenTree = tokenize(design.reflect);
  }

  return (
    <>
      <DefaultEditorWorkspaceLayout
        leftbar={<LayerHierarchy data={design.reflect} />}
      >
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <canvas.FigmaEmbedCanvas
              src={{ url: design.url }}
              width="100%"
              height="100%"
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel>
            <visualize_node.HorizontalHierarchyTreeVisualization
              key={reflect?.id}
              width={1000}
              height={400}
              tree={nodeToTreeVisualData(reflect)}
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
      <JsonTree hideRoot data={reflect} />
    </>
  );
}

function nodeToTreeVisualData(node: ReflectSceneNode): visualize_node.TreeNode {
  if (!node) {
    return {
      name: "Loading..",
    };
  }

  const _shortName = (fullName: string): string => {
    return fullName.slice(0, 40);
  };

  let _visualizedChildren;
  if ("children" in node) {
    _visualizedChildren = (node as any).children.map((c) => {
      return nodeToTreeVisualData(c);
    });
  }

  return {
    name: _shortName(node.name),
    children: _visualizedChildren,
    id: node.id,
    type: node.type,
  };
}
