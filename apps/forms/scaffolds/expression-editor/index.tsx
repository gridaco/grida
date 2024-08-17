import React, { useMemo } from "react";
import {
  Node,
  ReactFlow,
  ReactFlowProps,
  useEdgesState,
  useNodesState,
  MiniMap,
} from "@xyflow/react";
import PropertyAccessDropdownMenu from "@/scaffolds/sidecontrol/controls/context/variable";
import { useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  SidebarMenuGrid,
  SidebarMenuGridItem,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import {
  CalculatorIcon,
  GitCompareIcon,
  NotepadTextDashedIcon,
  RegexIcon,
  SquareFunctionIcon,
  VariableIcon,
  WorkflowIcon,
} from "lucide-react";

const initialNodes = [
  {
    id: "v",
    type: "property",
    position: { x: 0, y: 0 },
    data: { label: "1" },
  },
  {
    id: "add",
    type: "binary_expression",
    position: { x: -200, y: 0 },
    data: { label: "1" },
  },
  {
    id: "dec",
    type: "variable_declaration",
    position: { x: -400, y: 0 },
    data: { label: "1" },
  },
  {
    id: "o",
    type: "return",
    position: { x: 200, y: 0 },
    data: {},
  },
];
const initialEdges = [{ id: "e1-2", source: "v", target: "o" }];

export function ExpressionEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes = useMemo(
    () => ({
      property: PropertyNode,
      return: ReturnStatementNode,
      binary_expression: NumericBinaryExpressionNode,
      variable_declaration: VariableDeclarationNode,
    }),
    []
  );

  return (
    <div className="w-full h-full flex">
      <SidebarRoot>
        <SidebarSection>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Operators</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuGrid>
            <SidebarMenuGridItem>
              <CalculatorIcon />
              Math
            </SidebarMenuGridItem>
            <SidebarMenuGridItem>
              <GitCompareIcon />
              Compare
            </SidebarMenuGridItem>
            <SidebarMenuGridItem>
              <RegexIcon />
              Regex
            </SidebarMenuGridItem>
            <SidebarMenuGridItem>
              <WorkflowIcon />
              Condition
            </SidebarMenuGridItem>
            <SidebarMenuGridItem>
              <SquareFunctionIcon />
              Function
            </SidebarMenuGridItem>
            <SidebarMenuGridItem>
              <NotepadTextDashedIcon />
              Text
            </SidebarMenuGridItem>
            <SidebarMenuGridItem>
              <VariableIcon />
              Variable
            </SidebarMenuGridItem>
          </SidebarMenuGrid>
        </SidebarSection>
      </SidebarRoot>
      <main className="w-full h-full">
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={({ source, target }) =>
            setEdges([...edges, { id: `${source}-${target}`, source, target }])
          }
          nodesDraggable
          fitView
          fitViewOptions={{
            maxZoom: 1,
          }}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap zoomable pannable />
        </ReactFlow>
      </main>
    </div>
  );
}

function VariableDeclarationNode() {
  return (
    <div className="px-4 py-2 shadow-md rounded-md border">
      <div>
        <input type="text" placeholder="identifier" />
        <Handle type="target" position={Position.Left} />
      </div>
    </div>
  );
}

function NumericBinaryExpressionNode() {
  return (
    <div className="px-4 py-2 shadow-md rounded-md border">
      <div>
        <select>
          <option>+</option>
          <option>-</option>
          <option>*</option>
          <option>/</option>
        </select>
        <Handle type="target" position={Position.Left} style={{ top: 10 }} />
        <Handle type="target" position={Position.Left} style={{ top: 20 }} />
        <Handle type="source" position={Position.Right} />
      </div>
    </div>
  );
}

function PropertyNode({ data }: any) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md border">
      <div>
        <PropertyAccessDropdownMenu
          data={{
            a: { value: "" },
          }}
        />
        <Handle type="source" position={Position.Right} />
      </div>
    </div>
  );
}

function ReturnStatementNode() {
  return (
    <div className="px-4 py-2 shadow-md rounded-md border border-dashed">
      <span className="font-mono">output</span>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
