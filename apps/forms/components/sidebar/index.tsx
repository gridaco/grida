"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CaretDownIcon, CaretRightIcon } from "@radix-ui/react-icons";

export function SidebarRoot({
  side = "left",
  children,
}: React.PropsWithChildren<{
  side?: "left" | "right";
}>) {
  return (
    <nav
      className={cn(
        "relative w-60 h-full shrink-0 overflow-y-auto",
        // apply slightly dimmed background for main content
        "bg-workbench-panel",
        side === "left" ? "border-e" : "border-s"
      )}
    >
      {children}
    </nav>
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

export function SidebarMenuSectionContent({
  className,
  children,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return <div className={cn("w-full px-2 py-1", className)}>{children}</div>;
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
  children,
}: React.PropsWithChildren<{
  href: string;
}>) {
  const pathName = usePathname();

  const selected = pathName === href;

  return (
    <Link href={href}>
      {/* override selected prop */}
      {React.cloneElement(children as any, {
        selected,
        className: "cursor-pointer",
      })}
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
    className,
    disabled,
    children,
    onSelect,
    onExpandChange,
  }: React.PropsWithChildren<{
    expandable?: boolean;
    expanded?: boolean;
    level?: number;
    muted?: boolean;
    selected?: boolean;
    className?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
    onSelect?: () => void;
    onExpandChange?: (expand: boolean) => void;
  }>,
  forwardedRef
) {
  const hasiconslot = icon !== undefined || expandable;
  return (
    <div
      ref={forwardedRef as any}
      data-level={level}
      data-muted={muted}
      data-disabled={disabled}
      data-selected={selected}
      className={cn(
        "flex items-center",
        "relative group",
        "w-full px-2 py-1 rounded text-sm font-medium text-foreground",
        "text-ellipsis whitespace-nowrap overflow-hidden",
        "hover:bg-accent hover:text-accent-foreground cursor-default",
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
      {hasiconslot && (
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
                className="w-4 h-4 me-2 data-[expandable='true']:group-hover:opacity-0"
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
}: React.PropsWithChildren<{}>) {
  return <span className="text-ellipsis overflow-hidden">{children}</span>;
}

export function SidebarSection({
  children,
  className,
  ...props
}: React.PropsWithChildren<React.HtmlHTMLAttributes<HTMLDivElement>>) {
  return (
    <section className={cn("mx-2 mb-2", className)} {...props}>
      {children}
    </section>
  );
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
}: React.PropsWithChildren<{}>) {
  return (
    <span className="text-xs font-normal text-muted-foreground group-hover:text-accent-foreground">
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
