"use clinet";
import { cn } from "@/utils";
import React from "react";

export function Root({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col h-full w-full">{children}</div>;
}

export function Header({ children }: React.PropsWithChildren<{}>) {
  return (
    <header className="bg-background min-h-12 h-12 w-full flex items-center justify-between gap-4 px-4">
      {children}
    </header>
  );
}

export function HeaderMenus({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex gap-2 items-center">{children}</div>;
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
