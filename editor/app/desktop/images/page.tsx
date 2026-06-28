"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DesktopPageShell } from "@/scaffolds/desktop/chrome/page-shell";
import { DesktopImagePlayground } from "@/scaffolds/desktop/image-gen/image-playground";

/**
 * Desktop image-generation page (#908) — the dedicated home for BYOK image
 * generation. A `?model=<id>` query (set by "Try this model" in Settings)
 * preselects a model. Generation runs in the agent sidecar against the user's
 * connected provider key; the key never reaches this renderer (GRIDA-SEC-004).
 */
export default function DesktopImagesPage() {
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
  return <DesktopImagePlayground initialModelId={model} />;
}
