import dagre from "@dagrejs/dagre";
import { Data } from "@/lib/data";
import { Edge, Node, Position } from "@xyflow/react";
import {
  TABLE_NODE_ROW_HEIGHT,
  TABLE_NODE_TYPE,
  TABLE_NODE_WIDTH,
  type TableNodeData,
} from "../nodes";
import assert from "assert";

export function layout(
  tables: Data.Relation.TableDefinition[],
  mainTableKey: string
): {
  nodes: Node<TableNodeData>[];
  edges: Edge[];
} {
  if (!tables.length) {
    return { nodes: [], edges: [] };
  }

  const maintable = tables.find((table) => table.name === mainTableKey);
  assert(maintable, `Main table ${mainTableKey} not found`);

  const referenced_table_names = maintable.fks.map((fk) => fk.referenced_table);
  const referenced_tables = tables.filter((table) =>
    referenced_table_names.includes(table.name)
  );

  const nodes: Node<TableNodeData>[] = [maintable, ...referenced_tables].map(
    tableNode
  );

  const edges: Edge[] = [];

  for (const relation of maintable.fks) {
    const [source, sourceHandle] = findTablesHandleIds(
      tables,
      maintable.name,
      relation.referencing_column
    );
    const [target, targetHandle] = findTablesHandleIds(
      referenced_tables,
      relation.referenced_table,
      relation.referenced_column
    );

    // We do not support [external->this] flow currently.
    if (source && target) {
      edges.push({
        id: `${source}.${sourceHandle}-${target}.${targetHandle}`,
        source,
        sourceHandle,
        target,
        targetHandle,
      });
    }
  }

  return graphPosition(nodes, edges);
}

function findTablesHandleIds(
  tables: Data.Relation.TableDefinition[],
  table_name: string,
  column_name: string
): [string?, string?] {
  for (const table of tables) {
    if (table_name !== table.name) continue;

    for (const key of Object.keys(table.properties)) {
      if (column_name !== key) continue;

      return [table.name, key];
    }
  }

  return [];
}

function tableNode(table: Data.Relation.TableDefinition): Node<TableNodeData> {
  const properties = Object.keys(table.properties).map((key) => {
    const property = table.properties[key];
    return {
      id: property.name,
      name: property.name,
      format: property.format,
      is_primary: property.pk,
      is_nullable: property.null,
      is_unique: property.pk,
    } satisfies TableNodeData["properties"][number];
  });

  return {
    id: table.name,
    type: TABLE_NODE_TYPE,
    data: {
      name: table.name,
      is_referenced: false,
      properties,
    },
    position: { x: 0, y: 0 },
  };
}

const graphPosition = (nodes: Node<TableNodeData>[], edges: Edge[]) => {
  const MARGIN = 50;
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "LR",
    align: "UR",
    nodesep: 25,
    ranksep: 50,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: MARGIN + TABLE_NODE_WIDTH / 2,
      height:
        MARGIN +
        (TABLE_NODE_ROW_HEIGHT / 2) * (node.data.properties.length + 1), // columns + header
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;
    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - nodeWithPosition.width / 2,
      y: nodeWithPosition.y - nodeWithPosition.height / 2,
    };

    return node;
  });

  return { nodes, edges };
};
