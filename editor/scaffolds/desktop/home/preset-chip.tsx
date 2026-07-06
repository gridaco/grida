"use client";

import { XIcon } from "lucide-react";
import {
  ApplicationPreset,
  type ApplicationPresetId,
} from "./application-preset";

/**
 * `PresetChip` — the composer's mode chip. Reflects the active preset and
 * exposes a single affordance: an "x" that clears back to neutral `general`.
 * It is NOT a switch — the rail is the mutator; the chip only removes. The
 * neutral `general` base (no `art`) renders nothing.
 */
export function PresetChip({
  value,
  onChange,
}: {
  value: ApplicationPresetId;
  onChange: (id: ApplicationPresetId) => void;
}) {
  const spec = ApplicationPreset.byId(value);
  if (!spec.art) return null;
  const Icon = spec.icon;
  return (
    <span
      data-testid="desktop-home-preset-chip"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary"
    >
      <Icon className="size-3.5" />
      {spec.label}
      <button
        type="button"
        onClick={() => onChange(ApplicationPreset.DEFAULT)}
        aria-label={`Clear ${spec.label} mode`}
        className="flex size-4 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}
