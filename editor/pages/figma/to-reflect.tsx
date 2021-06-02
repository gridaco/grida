import React, { useState } from "react";
import { figmacomp, canvas } from "../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";

import { visualize_node } from "../../components/visualization";
import { FigmaTargetNodeConfig } from "@design-sdk/core/utils/figma-api-utils";
import { JsonTree } from "../../components/visualization/json-visualization/json-tree";

export default function FigmaToReflectNodePage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [targetnodeConfig, setTargetnodeConfig] =
    useState<FigmaTargetNodeConfig>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  const handleFigmaUrlEnter = (targetconfig: FigmaTargetNodeConfig) => {
    setTargetnodeConfig(targetconfig);
  };

  return (
    <>
      <canvas.FigmaEmbedCanvas src={{ url: targetnodeConfig.url }} />
      <figmacomp.FigmaScreenImporter
        onImported={handleOnDesignImported}
        onTargetEnter={handleFigmaUrlEnter}
      />
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
