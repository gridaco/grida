"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { SlidePage } from "./types";

/**
 * Full-screen slide presentation overlay.
 *
 * Mount with `open=true` to enter presentation mode. The overlay portals to
 * the document body and immediately requests Fullscreen API on its root
 * element. Listens for ArrowLeft / ArrowRight / Space / Escape and for the
 * `fullscreenchange` event so leaving fullscreen (Esc or system gesture)
 * also closes the overlay.
 *
 * Slides render via `<img src="data:image/svg+xml;...">` — no editor
 * involvement, no Skia, no DOM tree mutations. The pages' authored SVG is
 * the presentation source of truth.
 */
export function Presentation({
  open,
  pages,
  initialIndex = 0,
  onClose,
}: {
  open: boolean;
  pages: readonly SlidePage[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = React.useState(initialIndex);

  // Reset to the requested start slide each time we open.
  React.useEffect(() => {
    if (open) setIndex(Math.max(0, Math.min(initialIndex, pages.length - 1)));
  }, [open, initialIndex, pages.length]);

  // Subscribe to fullscreenchange BEFORE requesting fullscreen, otherwise a
  // very fast Esc could fire before we've attached the listener.
  // Fullscreen may be denied (lost user gesture, sandboxed iframe, etc.) —
  // the overlay still renders edge-to-edge, just without OS-level chrome.
  React.useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const onFsChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    el.requestFullscreen?.().catch(() => {});
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement)
        document.exitFullscreen?.().catch(() => {});
    };
  }, [open, onClose]);

  // Advance one slide; close the overlay if we're already on the last one.
  // Matches PowerPoint/Keynote behavior — past-end exits the deck.
  const advance = React.useCallback(() => {
    setIndex((i) => {
      if (i >= pages.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [pages.length, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          e.preventDefault();
          advance();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          setIndex((i) => Math.max(0, i - 1));
          break;
        case "Home":
          e.preventDefault();
          setIndex(0);
          break;
        case "End":
          e.preventDefault();
          setIndex(pages.length - 1);
          break;
        case "Escape":
          // Redundant when in fullscreen (fullscreenchange covers it), but
          // needed when fullscreen was denied.
          onClose();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pages.length, onClose, advance]);

  if (!open) return null;

  const current = pages[index];
  if (!current) return null;
  // The thumbnail data URI is the encoded SVG itself — kept in sync by
  // the doc store on every gesture-end. Same bytes as the editor's live
  // serialize, just URI-encoded for `<img src>`.
  const dataUri = current.thumbnailDataUri;

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      onClick={advance}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUri}
        alt={current.name}
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
      <div className="pointer-events-none absolute bottom-4 right-4 text-xs tabular-nums text-white/60 mix-blend-difference">
        {index + 1} / {pages.length}
      </div>
    </div>,
    document.body
  );
}
