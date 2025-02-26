"use clinet";
import { cn } from "@/utils";
import React from "react";

export function Root({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col h-full w-full">{children}</div>;
}

export function Header({ children }: React.PropsWithChildren<{}>) {
  return <header className="bg-background w-full">{children}</header>;
}

export function HeaderLine({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "px-2 min-h-11 h-11 flex items-center justify-between gap-4 border-b",
        className
      )}
    >
      {children}
    </div>
  );
}

export function HeaderMenus({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex gap-2 items-center">{children}</div>;
}

export function HeaderMenuItems({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex gap-1 items-center">{children}</div>;
}

export function HeaderSeparator() {
  return <div className="border-r h-6" />;
}

export function Content({
  children,
  className,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return (
    <div className={cn("flex flex-col w-full h-full", className)}>
      {children}
    </div>
  );
}

export function Footer({
  children,
  className,
}: React.PropsWithChildren<{
  className?: string;
}>) {
  return (
    <footer
      className={cn(
        "flex gap-4 min-h-8 overflow-hidden items-center px-2 py-1.5 w-full border-t bg-workbench-panel",
        className
      )}
    >
      {children}
    </footer>
  );
}

export function FooterSeparator() {
  return <div className="border-l h-6" />;
}
