"use client";

import * as React from "react";
import type { ItemInstance } from "@headless-tree/core";
import { TreeItem, TreeItemLabel } from "@/components/ui-editor/tree";
import { cn } from "@/components/lib/utils";
import {
  MaskIndicatorVariant,
  NodeMaskRole,
} from "@/grida-canvas-react-starter-kit/starterkit-hierarchy/mask";
import { NodeTypeIcon } from "@/grida-canvas-react-starter-kit/starterkit-icons/node-type-icon";
import { NameInput } from "./tree-item-name-input";
import {
  EyeClosedIcon,
  EyeOpenIcon,
  LockClosedIcon,
  LockOpen1Icon,
} from "@radix-ui/react-icons";
import grida from "@grida/schema";

export interface MaskIndicatorSlotProps {
  variant: MaskIndicatorVariant;
}

export interface NodeHierarchyTreeItemProps {
  item: ItemInstance<grida.program.nodes.Node>;
  node: grida.program.nodes.Node;
  isHovered: boolean;
  isRenaming: boolean;
  mask: NodeMaskRole;
  maskIndicatorVariant?: MaskIndicatorVariant;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onRenameCommit: (name: string) => void;
  onToggleLocked: () => void;
  onToggleActive: () => void;
  MaskIndicatorSlot?: React.ComponentType<MaskIndicatorSlotProps>;
}

const DefaultMaskIndicatorSlot: React.FC<MaskIndicatorSlotProps> = ({
  variant,
}) => (
  <svg
    data-slot="mask-indicator"
    data-variant={variant}
    aria-hidden="true"
    viewBox="0 0 24 32"
    width={24}
    height={32}
  >
    <path d="M13 0v28h-1V0z" />
  </svg>
);

interface MaskIndicatorContainerProps {
  variant?: MaskIndicatorVariant;
  SlotComponent: React.ComponentType<MaskIndicatorSlotProps>;
}

function MaskIndicatorContainer({
  variant,
  SlotComponent,
}: MaskIndicatorContainerProps) {
  switch (variant) {
    case "mask":
      return null;
    case "masked": {
      return (
        <div className="flex h-full w-3 shrink-0 items-center justify-center">
          <SlotComponent variant={variant} />
        </div>
      );
    }
    default:
      return null;
  }
}

function NodeActionButton({
  alwaysVisible,
  className,
  ...props
}: {
  alwaysVisible: boolean;
} & React.ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={cn(
        "opacity-0 group-hover/item:opacity-100 transition-opacity",
        alwaysVisible && "opacity-100",
        className
      )}
    />
  );
}

export const NodeHierarchyTreeItem = React.memo(function NodeHierarchyTreeItem({
  item,
  node,
  isHovered,
  isRenaming,
  mask,
  maskIndicatorVariant,
  onPointerEnter,
  onPointerLeave,
  onRenameCommit,
  onToggleLocked,
  onToggleActive,
  MaskIndicatorSlot = DefaultMaskIndicatorSlot,
}: NodeHierarchyTreeItemProps) {
  const maskRoleAttr = mask === "none" ? undefined : mask;

  return (
    <TreeItem
      item={item}
      className="h-7 max-h-7 w-full py-0.5"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      data-mask-role={maskRoleAttr}
    >
      <TreeItemLabel
        className={cn(
          "h-full bg-transparent px-1 py-1",
          isHovered && "bg-accent"
        )}
        data-mask-role={maskRoleAttr}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          onDoubleClick={() => {
            item.startRenaming();
          }}
        >
          <MaskIndicatorContainer
            variant={maskIndicatorVariant}
            SlotComponent={MaskIndicatorSlot}
          />
          <NodeTypeIcon node={node} className="size-3 shrink-0" />
          <div className="min-w-0 flex-1">
            <NameInput
              isRenaming={isRenaming}
              initialValue={node.name}
              onValueCommit={onRenameCommit}
              className="px-1 py-0.5 text-[11px] font-normal"
            />
          </div>
        </div>
        <div
          aria-label="actions"
          className={cn(
            "shrink-0 items-center gap-2 px-2",
            "group-data-[renaming=true]/item:hidden",
            "group-hover/item:flex",
            (node.locked || !node.active) && "flex",
            !(node.locked || !node.active) && "hidden"
          )}
        >
          <NodeActionButton
            alwaysVisible={node.locked}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked();
            }}
          >
            {node.locked ? (
              <LockClosedIcon className="size-3" />
            ) : (
              <LockOpen1Icon className="size-3" />
            )}
          </NodeActionButton>
          <NodeActionButton
            alwaysVisible={!node.active}
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive();
            }}
          >
            {node.active ? (
              <EyeOpenIcon className="size-3" />
            ) : (
              <EyeClosedIcon className="size-3" />
            )}
          </NodeActionButton>
        </div>
      </TreeItemLabel>
    </TreeItem>
  );
});
