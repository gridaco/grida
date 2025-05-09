"use client";
import React from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { cn } from "@/components/lib/utils";
import { Button } from "@/components/ui/button";

export function SandboxWrapper({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore link clicks
    if ((e.target as HTMLElement).tagName === "A") {
      e.preventDefault();
    }

    props.onClick?.(e);
  };

  return (
    <div
      {...props}
      className={cn("select-none", className)}
      onClick={handleClick}
    >
      <ErrorBoundary fallbackRender={Fallback}>{children}</ErrorBoundary>
    </div>
  );
}

function Fallback(props: FallbackProps) {
  return (
    <div className="prose dark:prose-invert prose-sm">
      <h2>Something Went Wrong</h2>
      <hr />
      <pre>{JSON.stringify(props.error, null, 2)}</pre>
      <Button onClick={props.resetErrorBoundary}>clear</Button>
    </div>
  );
}
