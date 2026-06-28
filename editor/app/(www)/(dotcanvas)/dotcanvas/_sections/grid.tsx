import React from "react";
import { cn } from "@app/ui/lib/utils";

/**
 * Minimal grid scaffold for the /dotcanvas spec page — a centered column with
 * visible rails and full-width dividers between rows. Deliberately calm: this
 * is a reference page, not a marketing surface.
 */

/** Centered column with visible top + side rails. */
export function GridFrame({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-screen-lg border-x border-t border-border bg-background",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Full-width horizontal divider between grid rows. */
export function GridDivider() {
  return <div aria-hidden className="h-px w-full bg-border" />;
}

/** A padded grid row. */
export function GridRow({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <section className={cn("relative px-6 py-14 md:px-12 md:py-20", className)}>
      {children}
    </section>
  );
}
