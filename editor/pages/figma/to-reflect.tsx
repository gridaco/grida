import React from "react";

import { ReflectSceneNode } from "@design-sdk/figma-node";
import { visualize_node } from "@code-editor/devtools/components/visualization";
import { JsonTree } from "@code-editor/devtools/components/visualization/json-visualization/json-tree";
import { TreeNode } from "@code-editor/devtools/components/visualization/node-visualization";

import { canvas } from "components";
import { useReflectTargetNode } from "../../query/from-figma";

export default function FigmaToReflectNodePage() {
  //
  const targetNodeConfig = useReflectTargetNode();
  const figmaNode = targetNodeConfig?.figma;
  const reflect = targetNodeConfig?.reflect;
  //

  return (
    <>
      <canvas.AsisPreviewFigmaEmbed src={{ url: targetNodeConfig?.url }} />
      <visualize_node.HorizontalHierarchyTreeVisualization
        key={reflect?.id}
        width={1000}
        height={400}
        tree={nodeToTreeVisualData(reflect)}
      />
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

  let _visualizedChildren: TreeNode[] | undefined;
  if ("children" in node) {
    _visualizedChildren = node.children.map((c) => {
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
