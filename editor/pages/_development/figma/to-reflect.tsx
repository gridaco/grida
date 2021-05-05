import React, { useState } from "react";
import { figmacomp, canvas } from "../../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import JSONTree from "react-json-tree";

import { visualize_node } from "../../../components/visualization";

export default function FigmaToReflectNodePage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [figmaNodeUrl, setFigmaNodeUrl] = useState<string>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  const handleFigmaUrlEnter = (url: string) => {
    setFigmaNodeUrl(url);
  };

  return (
    <>
      <canvas.FigmaEmbedCanvas url={figmaNodeUrl} />
      <figmacomp.FigmaScreenImporter
        onImported={handleOnDesignImported}
        onUrlEnter={handleFigmaUrlEnter}
      />
      <visualize_node.HorizontalHierarchyTreeVisualization
        key={reflect?.id}
        width={1000}
        height={400}
        tree={nodeToTreeVisualData(reflect)}
      />
      <JSONTree hideRoot data={reflect} />
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
