"use client";

import * as React from "react";

/**
 * Placeholder for the post-HUD-refactor surface entry component.
 *
 * NOT mounted anywhere — exists during Phase 1 of the
 * `feat/hud-replace-surface` refactor so we can incrementally build the
 * new surface in isolation while the live `surface.tsx` keeps shipping
 * unchanged. The typecheck pass guarantees that as new HUD-side APIs
 * land, this scaffold continues to compile.
 *
 * Phase 2 gutts `surface.tsx` and replaces it with something that builds
 * on the patterns established here. This file is expected to grow with
 * the HUD canvas mount, the DOM-overlay carve-out layer, and the input
 * layer wiring across phases 2-7.
 *
 * Do not import this from any route module. The dev showcase at
 * `app/(dev)/ui/components/hud/` is a separate showcase host with its
 * own intentional hook-based shape (see that file's header).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export function SurfaceNext(): React.ReactElement | null {
  return null;
}
