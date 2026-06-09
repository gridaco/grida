"use client";

import { Badge } from "@app/ui/components/badge";
import { useInspectorDebug } from "./use-inspector-debug";

const CARRIER_SHORT: Record<string, string> = {
  presentation_attribute: "attr",
  inline_style: "style",
  stylesheet: "css",
  inherited: "inh",
  defaulted: "def",
};

/**
 * Short badge for a `PaintValue` / `PropertyValue` provenance carrier.
 * Debug-only — renders nothing unless the global inspector Debug mode is on
 * (toggle in the logo dropdown). Call sites stay unchanged.
 */
export function ProvenanceChip({ carrier }: { carrier: string }) {
  const debug = useInspectorDebug();
  if (!debug) return null;
  return (
    <Badge
      variant="secondary"
      title={carrier}
      className="text-[9px] px-1.5 py-0 h-4 font-normal"
    >
      {CARRIER_SHORT[carrier] ?? carrier}
    </Badge>
  );
}
