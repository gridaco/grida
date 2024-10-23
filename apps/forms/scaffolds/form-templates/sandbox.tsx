"use client";
import React from "react";
import { cn } from "@/utils";

export function SandboxWrapper({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // ignore all
    e.preventDefault();
    // // Ignore link clicks
    // if ((e.target as HTMLElement).tagName === "A") {
    //   e.preventDefault();
    // }

    props.onClick?.(e);
  };

  return (
    <div
      {...props}
      className={cn("select-none", className)}
      onClick={handleClick}
    >
      {/* <link rel="stylesheet" href="/shadow/editor.css" /> */}
      {children}
    </div>
  );
}
