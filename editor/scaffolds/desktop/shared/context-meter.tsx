/**
 * Desktop context meter — a ring showing how full the model's context
 * window is. Hover for the exact %, click for the per-role breakdown.
 *
 * The ring **%** is real (provider-reported usage over the model's context
 * window; see `@/lib/agent-chat/context-usage`). The breakdown
 * (user / assistant / tools / other) is ESTIMATED — the provider never
 * reports tokens by author, so we approximate with chars/4 and let "Other"
 * absorb the system prompt, tools, and overhead. Shape follows opencode's
 * context view: a real ring over a clearly-marked estimate.
 *
 * Renders nothing until a turn settles with usage AND the model's window is
 * known — there's no honest number to show before that.
 */

"use client";

import { useMemo } from "react";
import type { UIMessage } from "ai";
// `@grida/ai-models` is the framework-free catalog (renderer-safe, unlike
// the `@/lib/ai/models` server seam) — same import the model picker uses.
import _models from "@grida/ai-models";
import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import { cn } from "@app/ui/lib/utils";
import { computeContextUsage } from "@/lib/agent-chat";

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Breakdown categories, in render order — drive both bar and rows. */
const CATEGORIES = [
  { key: "user", label: "User", color: "bg-sky-500" },
  { key: "assistant", label: "Assistant", color: "bg-violet-500" },
  { key: "tools", label: "Tools", color: "bg-amber-500" },
  { key: "other", label: "Other", color: "bg-muted-foreground/40" },
] as const;

export function DesktopContextMeter({
  messages,
  modelId,
  costUsd,
}: {
  messages: UIMessage[];
  /** Active model id — its catalog spec supplies the context window. */
  modelId: string;
  /** Real session cost so far, in USD. Shown when > 0. */
  costUsd?: number;
}) {
  const contextWindow = _models.text.modelSpecById(modelId)?.contextWindow;
  const {
    usedTokens,
    maxTokens,
    percent: ratio,
    breakdown,
  } = useMemo(
    () => computeContextUsage(messages, contextWindow),
    [messages, contextWindow]
  );

  if (maxTokens === 0 || usedTokens === 0) return null;

  const total =
    breakdown.user + breakdown.assistant + breakdown.tools + breakdown.other;
  const pct = percent.format(ratio);

  return (
    <Popover>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground"
                aria-label={`Context: ${pct} used`}
              >
                <Ring ratio={ratio} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{pct} of context used</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent align="start" className="w-72 p-0">
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Context · {pct}</span>
            <span className="font-mono text-muted-foreground">
              {compact.format(usedTokens)} / {compact.format(maxTokens)}
            </span>
          </div>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
            {CATEGORIES.map((c) =>
              breakdown[c.key] > 0 ? (
                <div
                  key={c.key}
                  className={c.color}
                  style={{ width: `${(breakdown[c.key] / total) * 100}%` }}
                />
              ) : null
            )}
          </div>
        </div>

        <div className="space-y-1.5 border-t p-3">
          {CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <span
                className={cn("size-2 shrink-0 rounded-[2px]", c.color)}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">{c.label}</span>
              <span className="font-mono tabular-nums">
                {compact.format(breakdown[c.key])}
              </span>
            </div>
          ))}
        </div>

        {typeof costUsd === "number" && costUsd > 0 && (
          <div className="flex items-center justify-between border-t bg-secondary px-3 py-2 text-xs">
            <span className="text-muted-foreground">Cost</span>
            <span className="font-mono tabular-nums">
              {usd.format(costUsd)}
            </span>
          </div>
        )}

        <p className="border-t px-3 py-2 text-[10px] leading-snug text-muted-foreground">
          The ring is exact. The breakdown is estimated (≈ chars/4) — “Other”
          includes the system prompt, tools &amp; overhead.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function Ring({ ratio }: { ratio: number }) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const r = 9;
  const circumference = 2 * Math.PI * r;
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      style={{ color: "currentColor" }}
    >
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity={0.2}
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
      />
    </svg>
  );
}
