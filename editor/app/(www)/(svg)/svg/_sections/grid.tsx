"use client";

import React from "react";
import { cn } from "@app/ui/lib/utils";

/**
 * Experimental Vercel-style grid system for the /svg marketing page.
 *
 * The page lives inside a centered column bounded by visible vertical rails
 * (plus a top rail where the grid begins). Sections stack as rows separated by
 * full-width dividers.
 */

/** Centered column with visible top + side rails. */
export function GridFrame({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-screen-xl border-x border-t border-border bg-background",
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

/** A padded grid row. Pass `bleed` to opt out of horizontal padding. */
export function GridRow({
  children,
  className,
  bleed = false,
}: React.PropsWithChildren<{ className?: string; bleed?: boolean }>) {
  return (
    <section
      className={cn(
        "relative",
        bleed ? "" : "px-6 md:px-12 py-20 md:py-28",
        className
      )}
    >
      {children}
    </section>
  );
}

/**
 * Border-divided cell grid — the bento look. Renders 1px lines between cells
 * via a `gap-px` background bleed, so every internal seam is a crisp grid line
 * that meets the column rails flush. Cells should set their own `bg-background`.
 */
export function GridCells({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn("grid gap-px bg-border border-t border-border", className)}
    >
      {children}
    </div>
  );
}
