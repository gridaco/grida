"use client";

import * as React from "react";
import { TreeItem, TreeItemLabel } from "@/components/ui-editor/tree";
import { cn } from "@app/ui/lib/utils";
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
  node: grida.program.nodes.Node;
  /** Visible depth in the flattened tree. */
  level: number;
  selected: boolean;
  focused: boolean;
  /** Can hold children (chevron + `into` drop target). */
  folder: boolean;
  expanded: boolean;
  dragTarget: boolean;
  /** Any drag is active — suppress hover so it doesn't fight the drop UI. */
  isDragActive: boolean;
  /** This row is the resolved drop's container (even when over a leaf). */
  dropParent: boolean;
  /** This row is inside a selected container's subtree. */
  inSelectionGroup: boolean;
  isHovered: boolean;
  isRenaming: boolean;
  mask: NodeMaskRole;
  maskIndicatorVariant?: MaskIndicatorVariant;
  onClick: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onToggleExpand: () => void;
  onStartRenaming: () => void;
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
  node,
  level,
  selected,
  focused,
  folder,
  expanded,
  dragTarget,
  isDragActive,
  dropParent,
  inSelectionGroup,
  isHovered,
  isRenaming,
  mask,
  maskIndicatorVariant,
  onClick,
  onPointerDown,
  onToggleExpand,
  onStartRenaming,
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
      level={level}
      selected={selected}
      focused={focused}
      folder={folder}
      expanded={expanded}
      renaming={isRenaming}
      dragTarget={dragTarget}
      dropParent={dropParent}
      inGroup={inSelectionGroup}
      className="h-7 max-h-7 w-full py-0.5"
      data-tree-row-id={node.id}
      data-row-depth={level}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      data-mask-role={maskRoleAttr}
    >
      <TreeItemLabel
        folder={folder}
        onChevronClick={onToggleExpand}
        className={cn(
          "h-full bg-transparent px-1 py-1",
          "!outline-none !ring-0",
          // Layers-only: stronger, theme-aware selection accent (Scenes
          // keeps the shared default). `!` so selected/drop beats the
          // shared `hover:bg-accent` when a row is both selected and
          // hovered — they are otherwise specificity-tied (Tailwind wraps
          // the `in-*` ancestor in `:where()`, which has zero specificity,
          // so a plain override would lose by stylesheet order).
          "in-data-[selected=true]:bg-sky-100! in-data-[selected=true]:text-sky-900 dark:in-data-[selected=true]:bg-sky-400/25! dark:in-data-[selected=true]:text-sky-50 in-data-[drag-target=true]:bg-sky-100! dark:in-data-[drag-target=true]:bg-sky-400/20!",
          // Drop-target + selection-group fills. Non-important so the
          // `!`-important selected/drag-target above always win. Only the
          // resolved drop *container* highlights (not its children) — same
          // as the Grida/Figma demo, which skips the descendant subtree.
          "in-data-[drop-parent=true]:bg-sky-100/70 dark:in-data-[drop-parent=true]:bg-sky-400/15",
          "in-data-[in-group=true]:bg-sky-50 dark:in-data-[in-group=true]:bg-sky-400/10",
          isHovered && !selected && !isDragActive && "bg-accent"
        )}
        data-mask-role={maskRoleAttr}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          onDoubleClick={onStartRenaming}
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
