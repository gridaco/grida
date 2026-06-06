"use client";

import * as React from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { cn } from "@app/ui/lib/utils";

/**
 * Presentational tree primitives. Library-agnostic by design: the row
 * state (`selected`, `focused`, `level`, …) is supplied by the consumer
 * instead of pulled off a tree-library item instance. The Grida editor
 * panels drive these from `@grida/tree-view`; the components themselves
 * stay dumb so the styling lives in one place.
 */

interface TreeContextValue {
  indent: number;
}

const TreeContext = React.createContext<TreeContextValue>({ indent: 20 });

function useTreeContext() {
  return React.useContext(TreeContext);
}

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  indent?: number;
}

const Tree = React.forwardRef<HTMLDivElement, TreeProps>(function Tree(
  { indent = 20, className, style, ...props },
  ref
) {
  const mergedStyle = {
    ...style,
    "--tree-indent": `${indent}px`,
  } as React.CSSProperties;

  return (
    <TreeContext.Provider value={{ indent }}>
      <div
        ref={ref}
        data-slot="tree"
        style={mergedStyle}
        className={cn("flex flex-col", className)}
        {...props}
      />
    </TreeContext.Provider>
  );
});

interface TreeItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visible depth — multiplied by the tree indent for inset padding. */
  level: number;
  selected?: boolean;
  focused?: boolean;
  folder?: boolean;
  expanded?: boolean;
  renaming?: boolean;
  dragTarget?: boolean;
  searchMatch?: boolean;
  /** This row is the resolved drop's parent (the container being dropped into). */
  dropParent?: boolean;
  /** This row is inside a selected container's subtree. */
  inGroup?: boolean;
}

function TreeItem({
  level,
  selected,
  focused,
  folder,
  expanded,
  renaming,
  dragTarget,
  searchMatch,
  dropParent,
  inGroup,
  className,
  style,
  children,
  ...props
}: TreeItemProps) {
  const { indent } = useTreeContext();

  const mergedStyle = {
    ...style,
    "--tree-padding": `${level * indent}px`,
  } as React.CSSProperties;

  return (
    <div
      data-slot="tree-item"
      style={mergedStyle}
      className={cn(
        "group/item z-10 ps-(--tree-padding) outline-hidden select-none not-last:pb-0.5 focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      data-focus={focused || undefined}
      data-folder={folder || undefined}
      data-renaming={renaming || undefined}
      data-selected={selected || undefined}
      data-drag-target={dragTarget || undefined}
      data-drop-parent={dropParent || undefined}
      data-in-group={inGroup || undefined}
      data-search-match={searchMatch || undefined}
      aria-expanded={folder ? !!expanded : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

interface TreeItemLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Render the folder chevron (rotation follows the parent `aria-expanded`). */
  folder?: boolean;
  /** Chevron click — wire to expand/collapse. Stops propagation. */
  onChevronClick?: (e: React.MouseEvent) => void;
}

function TreeItemLabel({
  folder,
  onChevronClick,
  children,
  className,
  ...props
}: TreeItemLabelProps) {
  return (
    <span
      data-slot="tree-item-label"
      className={cn(
        "in-focus-visible:ring-ring/50 bg-background not-in-data-[dragging]:hover:bg-accent in-data-[selected=true]:bg-accent in-data-[selected=true]:text-accent-foreground in-data-[drag-target=true]:bg-accent flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm transition-colors in-focus-visible:ring-[3px] in-data-[search-match=true]:bg-blue-50! [&_svg]:pointer-events-none [&_svg]:shrink-0 not-in-data-[folder=true]:ps-5",
        className
      )}
      {...props}
    >
      {folder && (
        <span
          data-slot="tree-item-chevron"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={
            onChevronClick
              ? (e) => {
                  e.stopPropagation();
                  onChevronClick(e);
                }
              : undefined
          }
          className="-m-1 flex size-5 items-center justify-center"
        >
          <ChevronDownIcon className="text-muted-foreground size-3 in-aria-[expanded=false]:-rotate-90" />
        </span>
      )}
      {children}
    </span>
  );
}

interface TreeDragLineProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Vertical offset in px relative to the tree container; `null` hides it. */
  top?: number | null;
  /**
   * Left inset in px — shifts the line to the resolved drop *depth* so a
   * horizontal "pop-out" reparent is visible. Omit (default 0) for flat
   * lists; the right edge stays pinned (`inset-x-0`).
   */
  indent?: number;
}

function TreeDragLine({
  top,
  indent = 0,
  className,
  style,
  ...props
}: TreeDragLineProps) {
  if (top == null) return null;
  return (
    <div
      style={{ ...style, top, left: indent }}
      className={cn(
        "bg-primary before:bg-background before:border-primary absolute inset-x-0 z-30 -mt-px h-0.5 w-[unset] before:absolute before:-top-[3px] before:left-0 before:size-2 before:rounded-full before:border-2 pointer-events-none",
        className
      )}
      {...props}
    />
  );
}

export { Tree, TreeItem, TreeItemLabel, TreeDragLine };
