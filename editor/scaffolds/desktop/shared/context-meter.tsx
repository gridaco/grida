/**
 * Desktop context meter — a ring estimating how much of the model's context
 * window the visible transcript occupies. Click for the breakdown.
 *
 * Renders nothing until the model's window is known and the visible transcript
 * has something estimateable.
 */

"use client";

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
import type { computeContextUsage } from "@/lib/agent-chat/context-usage";

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});
const rowPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatCostUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return usd.format(value);
}

const CATEGORIES = [
  { key: "user", label: "User", color: "bg-sky-500" },
  { key: "assistant", label: "Assistant", color: "bg-violet-500" },
  { key: "tools", label: "Tools", color: "bg-muted-foreground/70" },
  { key: "other", label: "Other", color: "bg-muted-foreground/40" },
] as const;

/**
 * The ring and its breakdown for an already computed usage. Renders nothing
 * until both the window and the transcript size are known.
 */
export function ContextMeter({
  usage,
  costUsd,
}: {
  usage: Pick<
    ReturnType<typeof computeContextUsage>,
    "usedTokens" | "maxTokens" | "percent" | "breakdown"
  > &
    Partial<Pick<ReturnType<typeof computeContextUsage>, "measured">>;
  costUsd?: number;
}) {
  const { usedTokens, maxTokens, percent: ratio, breakdown } = usage;
  if (maxTokens === 0 || usedTokens === 0) return null;
  // Experience contract: an estimate is labeled as one.
  const source = usage.measured ? "Reported by provider" : "Estimated";

  const pct = percent.format(ratio);
  const rows = [
    ...CATEGORIES.map((c) => ({
      key: c.key as string,
      label: c.label,
      color: c.color,
      tokens: breakdown[c.key],
    })),
    {
      key: "free",
      label: "Free space",
      color: "bg-muted-foreground/15",
      tokens: Math.max(0, maxTokens - usedTokens),
    },
  ];

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
                className="size-7 shrink-0 text-muted-foreground"
                aria-label={`Context: ${pct} used`}
              >
                <Ring ratio={ratio} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="text-center text-nowrap">
            <div className="text-background/70">Context window:</div>
            <div className="text-background/70">{pct} full</div>
            <div className="mt-0.5">
              {compact.format(usedTokens)} / {compact.format(maxTokens)} tokens
              used
            </div>
            <div className="text-background/70">{source}</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent align="start" className="w-72 p-0">
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              Context · {pct}{" "}
              <span className="font-normal text-muted-foreground">
                · {source}
              </span>
            </span>
            <span className="font-mono text-muted-foreground">
              {compact.format(usedTokens)} / {compact.format(maxTokens)}
            </span>
          </div>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/15">
            {CATEGORIES.map((c) =>
              breakdown[c.key] > 0 ? (
                <div
                  key={c.key}
                  className={c.color}
                  style={{ width: `${(breakdown[c.key] / maxTokens) * 100}%` }}
                />
              ) : null
            )}
          </div>
        </div>

        <div className="space-y-1 border-t p-3">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-[11px]">
              <span
                className={cn("size-2 shrink-0 rounded-[2px]", r.color)}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">{r.label}</span>
              <span className="w-12 text-right font-mono tabular-nums text-muted-foreground">
                {compact.format(r.tokens)}
              </span>
              <span className="w-12 text-right font-mono tabular-nums">
                {rowPercent.format(r.tokens / maxTokens)}
              </span>
            </div>
          ))}
        </div>
        {typeof costUsd === "number" && costUsd > 0 ? (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
            <span className="text-muted-foreground">Estimated base cost</span>
            <span className="font-mono tabular-nums">
              {formatCostUsd(costUsd)}
            </span>
          </div>
        ) : null}
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
