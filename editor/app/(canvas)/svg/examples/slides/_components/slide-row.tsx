"use client";

import * as React from "react";
import { cn } from "@app/ui/lib/utils";

// ─── DOM contract (mirrors `starterkit-slides`) ─────────────────────────────
//
// Row:  `[data-slide-row][data-slide-list-group="<group>"]`
// - `data-selected="true"` — canvas is viewing this slide.
//
// Group scopes: `group/slides` (per-row hover on thumbnail) + sibling-fed
// `group/slides-sidebar` (sidebar `:focus-within` for the strong accent tier).
// The two literals must stay in sync with the consuming selectors.

const GROUP = "slides" as const;

/**
 * Optional focus-scope wrapper around the slide list (and adjacent panels).
 * Wrapping the list with this so `:focus-within` lights up the **strong**
 * accent tier on the selected row when the sidebar has focus — soft tier
 * otherwise. Without it, only the soft tier applies.
 */
export function SlideListFocusScope({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      data-slide-sidebar-focus-scope
      className={cn(
        "group/slides-sidebar flex min-h-0 flex-1 flex-col outline-none",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Presentational thumbnail row. Mirrors the Keynote-style row from
 * `starterkit-slides/slide-list.tsx` (number column + bordered thumbnail
 * box). Zero coupling to the multi-page state — the host owns ids,
 * selection, ordering, and the thumbnail source.
 */
export type SlideRowProps = {
  /** Optional element id — used for `aria-activedescendant` wiring on the listbox container. */
  id?: string;
  /** 1-based slide number rendered in the index column. */
  index: number;
  /** Active / "viewing" state. Drives the sky-accent tier. */
  selected: boolean;
  /** CSS `aspect-ratio` value, e.g. `"1920 / 1080"`. */
  aspectRatio: string;
  /** Thumbnail src (data URI or http URL). Pass `null` for an empty stub. */
  thumbnailSrc: string | null;
  /** Hover tooltip / a11y label. Falls back to "Slide {index}". */
  label?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Slot for a per-row action — typically a delete button (auto-hidden until row hover). */
  actions?: React.ReactNode;
};

export const SlideRow = React.forwardRef<HTMLDivElement, SlideRowProps>(
  function SlideRow(
    { id, index, selected, aspectRatio, thumbnailSrc, label, onClick, actions },
    ref
  ) {
    return (
      <div
        ref={ref}
        id={id}
        role="option"
        aria-selected={selected}
        onClick={onClick}
        data-slide-row
        data-slide-list-group={GROUP}
        data-selected={selected ? "true" : undefined}
        className={cn(
          "group/slides flex items-start gap-1 rounded-xl px-2 py-2 cursor-pointer outline-none select-none transition-colors",
          "[&[data-selected=true]]:bg-workbench-accent-sky/10",
          "group-focus-within/slides-sidebar:[&[data-selected=true]]:bg-workbench-accent-sky/20"
        )}
      >
        <span
          className={cn(
            "text-xs mt-1 font-normal tabular-nums w-[3ch] text-left shrink-0 leading-none text-muted-foreground",
            "group-data-[selected=true]/slides:text-workbench-accent-sky/80",
            "group-focus-within/slides-sidebar:group-data-[selected=true]/slides:font-medium",
            "group-focus-within/slides-sidebar:group-data-[selected=true]/slides:text-workbench-accent-sky"
          )}
        >
          {index}
        </span>

        <div
          className={cn(
            "relative box-border flex-1 overflow-hidden rounded-md border-[1px] border-solid border-border/60 bg-card transition-[border-color] duration-150",
            "group-[&:not([data-selected])]/slides:group-hover/slides:border-border",
            "group-data-[selected=true]/slides:border-workbench-accent-sky/30",
            "group-focus-within/slides-sidebar:group-data-[selected=true]/slides:border-workbench-accent-sky/45"
          )}
          style={{ aspectRatio }}
        >
          {thumbnailSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc}
              alt={label ?? `Slide ${index}`}
              className="absolute inset-0 w-full h-full object-contain"
              draggable={false}
            />
          )}
          {actions && (
            <div className="absolute top-1 right-1 opacity-0 group-hover/slides:opacity-100 transition-opacity">
              {actions}
            </div>
          )}
        </div>
      </div>
    );
  }
);
