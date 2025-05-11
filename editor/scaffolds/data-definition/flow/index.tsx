import React, { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Edge,
  MiniMap,
  Node,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { TableNode, TABLE_NODE_TYPE } from "../nodes";
import { useTheme } from "next-themes";
import { Data } from "@/lib/data";
import { layout } from "./layout";

export function DefinitionFlow({
  tables,
  mainTableKey,
}: {
  tables: Data.Relation.TableDefinition[];
  mainTableKey: string;
}) {
  const reactFlow = useReactFlow();

  const nodeTypes = useMemo(
    () => ({
      [TABLE_NODE_TYPE]: TableNode,
    }),
    []
  );

  const miniMapNodeColor = "var(--secondary)";
  const miniMapMaskColor = "var(--secondary-forground)";

  useEffect(() => {
    const { nodes, edges } = layout(tables, mainTableKey);
    reactFlow.setNodes(nodes);
    reactFlow.setEdges(edges);
    setTimeout(() => reactFlow.fitView({}));
  }, [tables]);

  return (
    <>
      <ReactFlow
        defaultNodes={[]}
        defaultEdges={[]}
        panOnScroll
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
          deletable: false,
          style: {
            stroke: "color-mix(in oklch, var(--primary) 50%, transparent)",
            strokeWidth: 0.5,
          },
        }}
        fitView
        nodeTypes={nodeTypes}
        minZoom={0.8}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          gap={16}
          className="[&>*]:stroke-muted-foreground opacity-[25%]"
          variant={BackgroundVariant.Dots}
          color={"inherit"}
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={miniMapNodeColor}
          maskColor={miniMapMaskColor}
          bgColor="var(--background)"
          className="border rounded-md shadow-sm"
        />
      </ReactFlow>
    </>
  );
}
