"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import { XIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";

/** A panel's strip tab; selection, closing and previews belong to its owner. */
export function WorkbenchPanelTab({
  title,
  icon,
  active,
  onSelect,
  onClose,
  onClick,
  onKeyDown,
  onMouseDown,
  className,
  ref,
  ...props
}: WorkbenchPanelTab.Props) {
  return (
    <div
      {...props}
      ref={ref}
      role="tab"
      tabIndex={0}
      aria-selected={active}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.target !== event.currentTarget)
          return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        if (!event.defaultPrevented && event.button === 1) {
          event.preventDefault();
          onClose();
        }
      }}
      className={cn(
        "group flex h-7 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors [&_svg:not([class*='size-'])]:size-3.5",
        active
          ? "bg-muted text-foreground shadow-xs"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )}
    >
      {icon}
      <span className="max-w-[180px] truncate">{title}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={cn(
          "ml-1 grid size-4 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        aria-label={`Close ${title}`}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

export namespace WorkbenchPanelTab {
  export type Props = Omit<
    ComponentPropsWithRef<"div">,
    "title" | "onSelect" | "onClose" | "children"
  > & {
    title: string;
    icon?: ReactNode;
    active: boolean;
    onSelect(): void;
    onClose(): void;
  };
}
