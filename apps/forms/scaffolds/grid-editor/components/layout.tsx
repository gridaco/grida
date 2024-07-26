"use clinet";
import React from "react";

export function Root({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col h-full">{children}</div>;
}

export function Header({ children }: React.PropsWithChildren<{}>) {
  return (
    <header className="min-h-12 h-12 w-full flex items-center justify-between gap-4 px-4">
      {children}
    </header>
  );
}

export function HeaderMenus({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex gap-2 items-center">{children}</div>;
}

export function Content({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col w-full h-full">{children}</div>;
}

export function Footer({ children }: React.PropsWithChildren<{}>) {
  return (
    <footer className="flex gap-4 min-h-9 overflow-hidden items-center px-2 py-2 w-full border-t divide-x">
      {children}
    </footer>
  );
}
