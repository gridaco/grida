"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@app/ui/lib/utils";

/**
 * `SlideScrubPreview` — a **scrubbable filmstrip**.
 *
 * The interaction (call it *hover-scrubbing* / *pointer scrubbing*): the
 * pointer's HORIZONTAL position within the frame maps to a page index — the
 * left edge is the first page, the right edge is the last. Moving the cursor
 * across the frame "scrubs" through the pages like dragging a video playhead,
 * except it's fully manual: nothing auto-advances (it's not a looping gif), so
 * the user controls exactly which page they land on. Same gesture as scrubbing
 * a video timeline or a streaming-service hover preview, applied to a deck.
 *
 * The math: given `n` frames over a frame `w` px wide, each frame owns a `w / n`
 * slice. With a 100px-wide card and 10 pages, crossing 11px shows page 2, 21px
 * page 3, and so on. Pointer-leave resets to the first page — the resting
 * "cover" — so an un-hovered card always shows page one.
 *
 * Presentation-agnostic on purpose: it owns only the active index and the
 * pointer math, and delegates pixels to `renderFrame(index)`. The caller
 * decides what a frame is (here: a placeholder slide), so the same primitive
 * could scrub any indexed sequence later (real slide thumbnails, video frames…).
 */
export function SlideScrubPreview({
  count,
  renderFrame,
  className,
  showProgress = true,
  onActiveChange,
}: {
  /** Number of scrubbable frames (deck length). */
  count: number;
  /** Render the frame at `index` (0-based) — called with the scrubbed page. */
  renderFrame: (index: number) => ReactNode;
  className?: string;
  /** Segmented progress ticks along the bottom (one per frame), shown on hover
   *  of the enclosing `group`. */
  showProgress?: boolean;
  /** Notified when the scrubbed page changes (e.g. to sync an aria label). */
  onActiveChange?: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Mirror the active index so the pointer handler can skip redundant state
  // updates (and redundant `onActiveChange` calls) without reading state.
  const activeRef = useRef(0);

  const set = (index: number) => {
    if (activeRef.current === index) return;
    activeRef.current = index;
    setActive(index);
    onActiveChange?.(index);
  };

  const scrubTo = (clientX: number) => {
    const el = ref.current;
    if (!el || count <= 1) return;
    const { left, width } = el.getBoundingClientRect();
    if (width <= 0) return;
    const fraction = (clientX - left) / width;
    set(Math.min(count - 1, Math.max(0, Math.floor(fraction * count))));
  };

  return (
    <div
      ref={ref}
      onPointerMove={(e) => scrubTo(e.clientX)}
      onPointerLeave={() => set(0)}
      className={cn("relative overflow-hidden", className)}
    >
      {renderFrame(active)}
      {showProgress && count > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex gap-px p-1 opacity-0 transition-opacity group-hover:opacity-100">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-0.5 flex-1 rounded-full transition-colors",
                i === active ? "bg-foreground/70" : "bg-foreground/20"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
