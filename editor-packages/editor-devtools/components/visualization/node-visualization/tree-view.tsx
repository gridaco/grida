import React, { useMemo } from "react";
import { Group } from "@visx/group";
import { Tree, hierarchy } from "@visx/hierarchy";
import { LinkHorizontal } from "@visx/shape";
import { Node, TreeNode } from "./node";

const lightpurple = "#374469";

/**
 * Tree data input for representing component-instance referencing data.
 * @deprecated not implemented
 */
export interface TreeNodeWithComponents {
  type: "tree-node-with-components";
  entry: TreeNode;
  components: TreeNode[];
}

const defaultMargin = { top: 10, left: 80, right: 80, bottom: 10 };

export type TreeProps = {
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  tree: TreeNode;
};

export function HorizontalHierarchyTreeVisualization({
  width,
  height,
  tree,
  margin = defaultMargin,
}: TreeProps) {
  const data = useMemo(() => hierarchy(tree), []);
  const yMax = height - margin.top - margin.bottom;
  const xMax = width - margin.left - margin.right;

  return width < 10 ? null : (
    <svg width={width} height={height}>
      <rect width={width} height={height} fill="transparent" />
      <Tree<TreeNode> root={data} size={[yMax, xMax]}>
        {(tree) => (
          <Group top={margin.top} left={margin.left}>
            {tree.links().map((link, i) => (
              <LinkHorizontal
                key={`link-${i}`}
                data={link}
                stroke={lightpurple}
                strokeWidth="1"
                fill="none"
              />
            ))}
            {tree.descendants().map((node, i) => (
              <Node key={`node-${i}`} node={node} />
            ))}
          </Group>
        )}
      </Tree>
    </svg>
  );
}
