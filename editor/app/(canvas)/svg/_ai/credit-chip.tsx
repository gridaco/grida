"use client";

import { useAiCredits } from "@/lib/ai/credits";
import { Badge } from "@app/ui/components/badge";
import { cn } from "@app/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import { AI_GATE_FLOOR_CENTS, fmtUsd } from "@/lib/billing/fees";

/**
 * Compact credit / BYOK indicator for the floating SVG chat panel.
 *
 * Same data source as the `/ai` playground's CreditChip (`useAiCredits()`),
 * trimmed for an inline-titlebar surface: no refresh button, no billing
 * link, no "no balance" placeholder. Renders nothing when the user is
 * unauthenticated — the floating panel stays clean for guests, and the
 * server's billing gate handles the real enforcement.
 *
 * GRIDA-SEC-003: `byok` is the only client-visible signal that billing
 * is bypassed. The key itself never crosses to the client.
 */
export function CreditChip() {
  const credits = useAiCredits();

  if (credits.byok) {
    return (
      <Badge
        variant="outline"
        className="h-5 px-1.5 font-mono text-[10px] uppercase tracking-wide"
      >
        BYOK
      </Badge>
    );
  }

  if (credits.cents === null) return null;

  const lowBalance = credits.cents < AI_GATE_FLOOR_CENTS;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors",
            lowBalance
              ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
              : "border-border text-muted-foreground"
          )}
        >
          {credits.formatted ?? "—"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-mono text-xs">{credits.formattedExact ?? "—"}</div>
        <div className="text-[10px] opacity-70">
          {lowBalance
            ? `below floor (${fmtUsd(AI_GATE_FLOOR_CENTS)}) — top up to keep going`
            : "AI balance"}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
