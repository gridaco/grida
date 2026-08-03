"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DesktopPageShell } from "@/scaffolds/desktop/chrome/page-shell";
import { DesktopMediaTools } from "@/scaffolds/desktop/tools/desktop-media-tools";
import { DesktopMediaTool } from "@/scaffolds/desktop/tools/media-tool-registry";

export default function DesktopToolsPage() {
  const [generationBusy, setGenerationBusy] = useState(false);
  return (
    <DesktopPageShell navigationDisabled={generationBusy}>
      <Suspense>
        <ToolsWithQuery onGenerationBusyChange={setGenerationBusy} />
      </Suspense>
    </DesktopPageShell>
  );
}

function ToolsWithQuery({
  onGenerationBusyChange,
}: {
  onGenerationBusyChange: (busy: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const selection = DesktopMediaTool.resolveSelection(
    searchParams.get("tool"),
    searchParams.get("model")
  );
  return (
    <DesktopMediaTools
      selection={selection}
      initialMediaId={searchParams.get("item")}
      onGenerationBusyChange={onGenerationBusyChange}
    />
  );
}
