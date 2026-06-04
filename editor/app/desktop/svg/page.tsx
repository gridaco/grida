"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorkstationShell } from "@/scaffolds/desktop/workstation-shell";

/**
 * Desktop SVG workstation. Gated by `DesktopBridgeGate` in the parent
 * layout — web visitors never reach this; only the Electron renderer
 * with `window.grida` present does.
 *
 * `docId` comes from the URL search params (the agent sidecar's file
 * registry uses opaque ids per GRIDA-SEC-004 — the renderer never
 * sees the absolute path). The main process always supplies it when
 * spawning a document window. If a renderer somehow loads this route
 * without one (a stale bookmark, a direct URL paste), the workstation
 * shell surfaces a "no document open" message — V1 has no untitled
 * path, so we don't invent one.
 *
 * `useSearchParams` is a client hook that opts the page into a
 * client-side rendering boundary; the `Suspense` wrapper is required
 * because Next.js will bail to SSR for the initial paint and
 * `useSearchParams` deopts there.
 */
export default function DesktopSvgPage() {
  return (
    <Suspense fallback={null}>
      <DesktopSvgPageInner />
    </Suspense>
  );
}

function DesktopSvgPageInner() {
  const params = useSearchParams();
  const docId = params.get("docId") ?? undefined;
  return <WorkstationShell docId={docId} />;
}
