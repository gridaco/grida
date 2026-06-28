"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DesktopPageShell } from "@/scaffolds/desktop/chrome/page-shell";
import { DesktopVideoPlayground } from "@/scaffolds/desktop/video-gen/video-playground";

/**
 * Desktop video-generation page (#908) — the dedicated home for BYOK video
 * generation, the sibling of `/desktop/images`. A `?model=<id>` query (set by
 * "Try this model" in Settings) preselects a model. Generation runs in the
 * agent sidecar against the user's connected provider key; the key never
 * reaches this renderer (GRIDA-SEC-004).
 */
export default function DesktopVideoPage() {
  return (
    <DesktopPageShell>
      <Suspense>
        <PlaygroundWithQuery />
      </Suspense>
    </DesktopPageShell>
  );
}

function PlaygroundWithQuery() {
  const model = useSearchParams().get("model") ?? undefined;
  return <DesktopVideoPlayground initialModelId={model} />;
}
