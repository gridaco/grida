import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

export function SidebarRoot({ children }: React.PropsWithChildren<{}>) {
  return (
    <nav className="relative w-60 h-full shrink-0 overflow-y-auto border-e">
      {children}
    </nav>
  );
}

export function SidebarMenuList({ children }: React.PropsWithChildren<{}>) {
  return <ul className="flex flex-col gap-0.5">{children}</ul>;
}

export function SidebarMenuGrid({ children }: React.PropsWithChildren<{}>) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
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
        "w-full px-2 py-1 rounded hover:bg-accent text-sm font-medium text-foreground data-[muted='true']:text-muted-foreground",
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

export function SidebarMenuItem({
  level,
  muted,
  selected,
  className,
  children,
}: React.PropsWithChildren<{
  level?: number;
  muted?: boolean;
  selected?: boolean;
  className?: string;
}>) {
  return (
    <div
      data-level={level}
      data-muted={muted}
      className={cn(
        "relative group",
        "w-full px-2 py-1 rounded hover:bg-accent text-sm font-medium text-foreground data-[muted='true']:text-muted-foreground",
        "text-ellipsis whitespace-nowrap overflow-hidden",
        className
      )}
      style={{
        paddingLeft: level ? `${level * 1}rem` : undefined,
      }}
    >
      {children}
    </div>
  );
}

export function SidebarSection({ children }: React.PropsWithChildren<{}>) {
  return <section className="mx-2 mb-2">{children}</section>;
}

export function SidebarSectionHeaderItem({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "relative group",
        "w-full px-2 py-1 my-1 rounded hover:bg-accent text-sm font-medium text-foreground data-[muted='true']:text-muted-foreground",
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
    <span className="text-xs font-normal text-muted-foreground">
      {children}
    </span>
  );
}

export function SidebarMenuItemActions({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <div className="absolute right-1 top-0 bottom-0 flex gap-2 items-center bg-background opacity-0 group-hover:opacity-100 group-hover:bg-accent transition-opacity rounded">
      {children}
    </div>
  );
}

export function SidebarSectionHeaderAction({
  children,
  ...props
}: React.PropsWithChildren<React.ComponentProps<typeof Button>>) {
  return (
    <Button
      {...props}
      variant="ghost"
      size="sm"
      className={cn("w-5 h-5 p-0", props.className)}
    >
      {children}
    </Button>
  );
}