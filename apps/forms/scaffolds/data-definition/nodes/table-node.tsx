import React from "react";
import { DiamondIcon, Fingerprint, Hash, Key, Table2 } from "lucide-react";
import { Handle, Node, NodeProps } from "@xyflow/react";
import { cn } from "@/utils/cn";
import type { TableNodeData } from "./types";
import { toShorter } from "@/lib/pg-meta/k/alias";

// ReactFlow is scaling everything by the factor of 2
const TABLE_NODE_WIDTH = 320;
const TABLE_NODE_ROW_HEIGHT = 44;

const TableNode = ({
  data,
  targetPosition,
  sourcePosition,
}: NodeProps<Node<TableNodeData>>) => {
  // Important styles is a nasty hack to use Handles (required for edges calculations), but do not show them in the UI.
  // ref: https://github.com/wbkd/react-flow/discussions/2698
  const hiddenNodeConnector =
    "!h-px !w-px !min-w-0 !min-h-0 !cursor-grab !border-0 !opacity-0";

  const itemHeight = "h-[22px]";

  return (
    <>
      {data.is_referenced ? (
        <header className="text-[0.55rem] px-2 py-1 border rounded-sm bg-background flex gap-1 items-center">
          {data.name}
          {targetPosition && (
            <Handle
              type="target"
              id={data.name}
              position={targetPosition}
              className={cn(hiddenNodeConnector)}
            />
          )}
        </header>
      ) : (
        <div
          className="border-[0.5px] overflow-hidden rounded-[4px] bg-background shadow-sm"
          style={{ width: TABLE_NODE_WIDTH / 2 }}
        >
          <header
            className={cn(
              "text-[0.55rem] px-2 bg-background flex gap-1 items-center",
              itemHeight
            )}
          >
            <Table2
              strokeWidth={1}
              size={12}
              className="text-muted-foreground"
            />
            {data.name}
          </header>

          {data.properties.map((column) => (
            <div
              className={cn(
                "text-[8px] leading-5 relative flex flex-row justify-items-start",
                "border-t",
                "border-t-[0.5px]",
                "hover:bg-accent transition cursor-default",
                itemHeight
              )}
              key={column.id}
            >
              <div
                className={cn(
                  "gap-[0.24rem] flex mx-2 align-middle items-center justify-start",
                  column.is_primary && "basis-1/5"
                )}
              >
                {column.is_primary && (
                  <Key
                    size={8}
                    strokeWidth={1}
                    className={cn(
                      // 'sb-grid-column-header__inner__primary-key'
                      "flex-shrink-0",
                      "text-muted-foreground"
                    )}
                  />
                )}
                {column.is_nullable && (
                  <DiamondIcon
                    size={8}
                    strokeWidth={1}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                )}
                {!column.is_nullable && (
                  <DiamondIcon
                    size={8}
                    strokeWidth={1}
                    fill="currentColor"
                    className="flex-shrink-0 text-muted-foreground"
                  />
                )}
                {column.is_unique && (
                  <Fingerprint
                    size={8}
                    strokeWidth={1}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                )}
              </div>
              <div className="flex w-full justify-between">
                <span className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[85px]">
                  {column.name}
                </span>
                <span className="px-2 inline-flex justify-end font-mono text-muted-foreground text-[0.4rem]">
                  {toShorter(column.format)}
                </span>
              </div>
              {targetPosition && (
                <Handle
                  type="target"
                  id={column.id}
                  position={targetPosition}
                  className={cn(hiddenNodeConnector, "!left-0")}
                />
              )}
              {sourcePosition && (
                <Handle
                  type="source"
                  id={column.id}
                  position={sourcePosition}
                  className={cn(hiddenNodeConnector, "!right-0")}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export { TABLE_NODE_ROW_HEIGHT, TABLE_NODE_WIDTH, TableNode };
