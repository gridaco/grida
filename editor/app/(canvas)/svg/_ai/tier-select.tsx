"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import { Badge } from "@app/ui/components/badge";
import { models, type ModelTier } from "@/lib/ai/models";
import { useSvgAgentTier } from "./provider";
import { AGENT_TIERS } from "@grida/agent/tiers";

// Compact one-line label per tier. Pricing is shown inside the dropdown,
// not in the trigger, so the title bar stays narrow.
const TIER_LABEL: Record<ModelTier, string> = {
  nano: "Nano",
  mini: "Mini",
  pro: "Pro",
  max: "Max",
};

type Option = {
  tier: ModelTier;
  label: string;
  /** Model name shown beneath the tier label in the dropdown. */
  modelLabel: string;
  /** USD per 1M input tokens — for the secondary "$X / $Y per 1M" line. */
  inputUsd: number;
  /** USD per 1M output tokens. */
  outputUsd: number;
};

const OPTIONS: readonly Option[] = AGENT_TIERS.map((tier) => {
  const spec = models[tier];
  return {
    tier,
    label: TIER_LABEL[tier],
    modelLabel: spec.label,
    inputUsd: spec.cost.input,
    outputUsd: spec.cost.output,
  };
});

/**
 * Model-tier dropdown for the SVG agent panel. Lives in the title bar; the
 * choice flows through `provider.tsx` → `client-chat.ts`'s body getter →
 * server route allowlist → `prepareCall(model(tier))`.
 *
 * The server validates and falls back to its default for unknown values, so
 * the only invariant the UI must preserve is that `value` is one of
 * `AGENT_TIERS`.
 */
export function TierSelect() {
  const { tier, setTier } = useSvgAgentTier();
  const selected = OPTIONS.find((o) => o.tier === tier) ?? OPTIONS[0];

  return (
    <Select value={tier} onValueChange={(v) => setTier(v as ModelTier)}>
      <SelectTrigger
        size="sm"
        aria-label="Model tier"
        className="h-6 gap-1 border-none bg-transparent px-2 text-[11px] shadow-none hover:bg-muted/60"
      >
        <SelectValue>{selected.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[220px]">
        {OPTIONS.map((opt) => (
          <SelectItem key={opt.tier} value={opt.tier} className="text-xs">
            {/* Single wrapper: shadcn's SelectItem forces its ItemText span
                to `flex items-center` via a `*:[span]:last:flex` rule, which
                would otherwise lay our two rows out side-by-side instead of
                stacked. Keeping one child here lets us own the inner layout. */}
            <div className="flex w-full min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium">{opt.label}</span>
                <Badge
                  variant="secondary"
                  className="px-1 py-0 font-mono text-[9px] uppercase tracking-wide"
                >
                  {opt.tier}
                </Badge>
                <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                  ${opt.inputUsd}/${opt.outputUsd}
                </span>
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {opt.modelLabel}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
