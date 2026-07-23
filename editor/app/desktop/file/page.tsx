"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DesktopFileShell } from "@/scaffolds/desktop/file/file-shell";
import { LastWorkspaceMarker } from "@/scaffolds/desktop/shared/last-workspace-marker";

/**
 * Desktop **file window** — the single dedicated editor route for one thing:
 * a single file or a `.canvas` deck (replaces `/desktop/svg` + `/desktop/canvas`).
 * Gated by `DesktopBridgeGate` in the parent layout — only the Electron renderer
 * with `window.grida` present reaches it.
 *
 * Param-discriminated:
 *   - `?docId=<id>` → single-file SVG editor (the agent sidecar's opaque
 *     registry; the renderer never sees the absolute path, per GRIDA-SEC-004).
 *   - `?id=<workspaceId>` (+ optional `?path=<basePath>`) → `.canvas` slides
 *     deck, read/written through the workspace bridge fs.
 *
 * `useSearchParams` opts the page into a client boundary; the `Suspense`
 * wrapper is required because Next bails to SSR for the initial paint.
 */
export default function DesktopFilePage() {
  return (
    <Suspense fallback={null}>
      <DesktopFilePageInner />
    </Suspense>
  );
}

function DesktopFilePageInner() {
  const params = useSearchParams();
  const docId = params.get("docId") ?? undefined;
  const workspaceId = params.get("id") ?? undefined;
  // The `.canvas` bundle's dir within the workspace; "" when the workspace root
  // IS the bundle (a `.canvas` opened directly).
  const basePath = params.get("path") ?? "";
  // Key by the active target so navigating between files/decks remounts the
  // shell cleanly (fresh editor + AgentFs).
  return (
    <div className="h-dvh">
      {workspaceId && !docId && (
        <LastWorkspaceMarker
          workspaceId={workspaceId}
          surface="canvas"
          basePath={basePath}
        />
      )}
      <DesktopFileShell
        key={docId ?? `${workspaceId}:${basePath}`}
        docId={docId}
        workspaceId={workspaceId}
        basePath={basePath}
      />
    </div>
  );
}
