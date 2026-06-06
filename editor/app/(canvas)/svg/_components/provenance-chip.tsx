"use client";

import { Badge } from "@app/ui/components/badge";

const CARRIER_SHORT: Record<string, string> = {
  presentation_attribute: "attr",
  inline_style: "style",
  stylesheet: "css",
  inherited: "inh",
  defaulted: "def",
};

/** Short badge for a `PaintValue` / `PropertyValue` provenance carrier. */
export function ProvenanceChip({ carrier }: { carrier: string }) {
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
