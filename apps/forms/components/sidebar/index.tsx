"use client";

import React, { ComponentType, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CaretDownIcon, CaretRightIcon } from "@radix-ui/react-icons";
import { FixedSizeGrid, type GridChildComponentProps } from "react-window";
import { useMeasure } from "@uidotdev/usehooks";

export function SidebarRoot({
  side = "left",
  className,
  children,
}: React.PropsWithChildren<{
  side?: "left" | "right";
  className?: string;
}>) {
  return (
    <aside
      className={cn(
        "relative w-60 h-full shrink-0 overflow-y-auto",
        // apply slightly dimmed background for main content
        "bg-workbench-panel",
        side === "left" ? "border-e" : "border-s",
        className
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <header
      className={cn(
        "sticky top-0 w-full px-2 py-2 border-b z-10",
        // apply slightly dimmed background for main content
        "bg-workbench-panel backdrop-blur-md",
        className
      )}
    >
      {children}
    </header>
  );
}

export function SidebarMenuList({
  children,
  className,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return (
    <ul className={cn("flex flex-col gap-0.5 pb-4", className)}>{children}</ul>
  );
}

export function SidebarMenuGrid({ children }: React.PropsWithChildren<{}>) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
}

export function SidebarVirtualizedMenuGrid<T>({
  items,
  cols = 3,
  columnWidth,
  rowHeight,
  renderItem,
  className,
  gap = 8,
}: {
  items: T[];
  cols?: number;
  columnWidth: number;
  rowHeight: number;
  gap?: number;
  renderItem: (data: {
    item: T;
    rowIndex: number;
    columnIndex: number;
  }) => React.ReactNode;
  className?: string;
}) {
  const [containerRef, container] = useMeasure();

  const rowCount = Math.ceil(items.length / cols);

  const Cell: React.FC<GridChildComponentProps> = ({
    columnIndex,
    rowIndex,
    style,
  }) => {
    const itemIndex = rowIndex * cols + columnIndex;

    if (itemIndex >= items.length) return null;

    const item = items[itemIndex];

    const adjustedStyle = {
      ...style,
      width: (style.width as number) - gap,
      height: (style.height as number) - gap,
    };

    return (
      <div style={adjustedStyle}>
        {renderItem({ item, rowIndex, columnIndex })}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={cn("w-full h-full", className)}>
      <FixedSizeGrid
        columnCount={cols}
        rowCount={rowCount}
        columnWidth={columnWidth + gap} // Include gap in the grid's column width
        rowHeight={rowHeight + gap} // Include gap in the grid's row height
        width={container.width ?? 0}
        height={container.height ?? 0}
      >
        {Cell}
      </FixedSizeGrid>
    </div>
  );
}

export function SidebarMenuGridItem({
  children,
  className,
  ...props
}: React.PropsWithChildren<React.HtmlHTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cn(
        "aspect-square",
        "relative group",
        "w-full px-2 py-1 rounded hover:bg-secondary text-sm font-medium text-foreground data-[muted='true']:text-muted-foreground",
        "text-ellipsis whitespace-nowrap overflow-hidden",
        "flex flex-col items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarMenuLink({
  href,
  layout,
  children,
}: React.PropsWithChildren<{
  href: string;
  /**
   * If true, the this is a layout link, and also stays selected when the path is a subpath of the href
   */
  layout?: boolean;
}>) {
  const pathName = usePathname();

  const selected =
    pathName === href || (layout && pathName.startsWith(href + "/"));

  return (
    <Link href={href}>
      {/* override selected prop */}
      {React.cloneElement(children as any, { selected })}
    </Link>
  );
}

export const SidebarMenuItem = React.forwardRef(function SidebarMenuItem(
  {
    expandable,
    expanded,
    icon,
    level,
    muted,
    selected,
    hovered,
    className,
    disabled,
    children,
    onSelect,
    onExpandChange,
    onPointerEnter,
    onPointerLeave,
  }: React.PropsWithChildren<{
    expandable?: boolean;
    expanded?: boolean;
    level?: number;
    muted?: boolean;
    selected?: boolean;
    /**
     * when externally hoverred (e.g. in design editor) if true, this will mimic hover state
     * even when false, this will not prevent from hover: being styled when user interaction
     */
    hovered?: boolean;
    className?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
    onSelect?: (e: React.MouseEvent<HTMLDivElement>) => void;
    onExpandChange?: (expand: boolean) => void;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
  }>,
  forwardedRef
) {
  const has_icon_slot = icon !== undefined || expandable;
  return (
    <div
      ref={forwardedRef as any}
      data-level={level}
      data-muted={muted}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      data-disabled={disabled}
      data-hovered={hovered}
      data-selected={selected}
      className={cn(
        "flex items-center",
        "relative group",
        "w-full px-2 py-1 rounded text-sm font-medium text-foreground",
        "text-ellipsis whitespace-nowrap overflow-hidden",
        "hover:bg-accent hover:text-accent-foreground data-[hovered='true']:bg-accent data-[hovered='true']:text-accent-foreground",
        "data-[muted='true']:text-muted-foreground",
        "data-[disabled='true']:cursor-not-allowed data-[disabled='true']:opacity-40 data-[disabled='true']:bg-background",
        "data-[selected='true']:bg-accent data-[selected='true']:text-accent-foreground",
        className
      )}
      style={{
        paddingLeft: level ? `${level * 1}rem` : undefined,
      }}
      onClick={onSelect}
    >
      {has_icon_slot && (
        <div className="relative w-4 h-4 me-2">
          {expandable && (
            <button
              type="button"
              className="absolute z-10 w-4 h-4 me-2 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onExpandChange?.(!expanded);
              }}
            >
              {expanded ? <CaretDownIcon /> : <CaretRightIcon />}
            </button>
          )}
          <>
            {icon && (
              <div
                data-expandable={expandable}
                className="w-4 h-4 me-2 flex items-center justify-center data-[expandable='true']:group-hover:opacity-0"
              >
                {icon}
              </div>
            )}
          </>
        </div>
      )}
      {children}
    </div>
  );
});

export function SidebarMenuItemLabel({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn("text-ellipsis overflow-hidden cursor-default", className)}
    >
      {children}
    </span>
  );
}

export function SidebarSection({
  children,
  className,
  hidden,
  ...props
}: React.PropsWithChildren<React.HtmlHTMLAttributes<HTMLDivElement>>) {
  if (hidden) return null;
  return (
    <section className={cn("mx-2 mb-2", className)} {...props}>
      {children}
    </section>
  );
}

export function SidebarMenuSectionContent({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return <div className={cn("w-full px-2 py-1", className)}>{children}</div>;
}

export function SidebarSectionHeaderItem({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "relative group",
        "w-full px-2 py-1 my-1 rounded hover:bg-accent hover:text-accent-foreground text-sm font-medium text-foreground data-[muted='true']:text-muted-foreground",
        "text-ellipsis whitespace-nowrap overflow-hidden",
        "flex justify-between items-center",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SidebarSectionHeaderLabel({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        "text-xs text-start font-normal text-muted-foreground overflow-hidden text-ellipsis group-hover:text-accent-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SidebarSectionHeaderActions({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <span
      className={cn(
        "invisible text-xs font-normal text-muted-foreground group-hover:visible",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SidebarMenuItemActions({
  children,
  className,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      {...props}
      className={cn(
        "absolute right-1 top-0 bottom-0 flex gap-2 items-center bg-background opacity-0 group-hover:opacity-100 group-hover:bg-accent transition-opacity rounded",
        className
      )}
    >
      {children}
    </div>
  );
}

export const SidebarMenuItemAction = React.forwardRef(
  function SidebarMenuItemAction(
    {
      children,
      ...props
    }: React.PropsWithChildren<React.ComponentProps<typeof Button>>,
    forwardedRef
  ) {
    return (
      <Button
        ref={forwardedRef as any}
        {...props}
        variant="ghost"
        size="sm"
        className={cn("w-5 h-5 p-0", props.className)}
      >
        {children}
      </Button>
    );
  }
);
