/**
 * Context-window estimate — the data behind the desktop context meter.
 *
 * Pure + framework-free (no react, no AI-SDK imports) so the math is one
 * testable unit. The view (`scaffolds/desktop/shared/context-meter.tsx`)
 * memoizes {@link computeContextUsage} and renders the ring + popover.
 *
 * ## Two numbers, two meanings
 *
 * The ring **%** is an estimate of the current transcript's context
 * footprint. The desktop client does not have the exact prompt that the
 * runtime will send next: hidden system prompt, skill blocks, tool schemas,
 * provider framing, and server-side compaction state all live outside this
 * UI message list. Until the runtime exposes a prompt-token preflight value,
 * the honest client-side value is chars/4 over the visible message parts.
 *
 * Provider-reported `metadata.usage` is still surfaced separately as
 * last-turn usage. That number is useful for cost/debugging, but it is not
 * current context occupancy: multi-step tool loops can resend context and
 * accumulate far more provider input tokens than the final live transcript
 * occupies.
 *
 * The role **breakdown** (user / assistant / tools / other) is estimated
 * from visible message parts only.
 */

/** chars/4 — the portable token approximation the RFC + compactor use. */
const CHARS_PER_TOKEN = 4;

/** Rough token estimate from raw text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Provider-reported per-turn usage, as stamped on an assistant message's
 * `metadata.usage`. Mirrors `@grida/ai-agent`'s `MessageUsage` — kept
 * local so this renderer module never imports the server package. `input`
 * already EXCLUDES cache reads (the recorder normalizes it), so the five
 * buckets sum without double-counting.
 */
export type MessageUsage = {
  input?: number;
  output?: number;
  reasoning?: number;
  cache_read?: number;
  cache_write?: number;
};

/** Provider usage total for a settled turn; not current context occupancy. */
export function usageTokenTotal(usage: MessageUsage): number {
  return (
    (usage.input ?? 0) +
    (usage.output ?? 0) +
    (usage.reasoning ?? 0) +
    (usage.cache_read ?? 0) +
    (usage.cache_write ?? 0)
  );
}

function hasAnyUsage(usage: MessageUsage): boolean {
  return usageTokenTotal(usage) > 0;
}

// -- Minimal structural shapes -------------------------------------------
// Typed loosely so the pure module stays AI-SDK-agnostic and unit tests
// can pass plain objects. The view hands real `UIMessage`s in.

type PartLike = {
  type?: string;
  text?: unknown;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
};

type MessageLike = {
  role: string;
  parts?: readonly PartLike[];
  metadata?: unknown;
};

/** A tool invocation part (call + result live on one part in AI SDK v6). */
function isToolPart(part: PartLike): boolean {
  return (
    part.type === "dynamic-tool" ||
    (typeof part.type === "string" && part.type.startsWith("tool-"))
  );
}

function isTextPart(part: PartLike): boolean {
  return part.type === "text" || part.type === "reasoning";
}

/** Estimated tokens a single part contributes to the prompt. */
function estimatePartTokens(part: PartLike): number {
  if (isTextPart(part)) {
    return typeof part.text === "string" ? estimateTokens(part.text) : 0;
  }
  if (isToolPart(part)) {
    let s = "";
    if (part.input !== undefined) s += safeStringify(part.input);
    if (part.output !== undefined) s += safeStringify(part.output);
    if (typeof part.errorText === "string") s += part.errorText;
    return estimateTokens(s);
  }
  return 0;
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/** The latest assistant message's stamped usage, or `undefined` until the
 * first turn settles (usage lands after `finish`). */
export function lastAssistantUsage(
  messages: readonly MessageLike[]
): MessageUsage | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const usage = (m.metadata as { usage?: MessageUsage } | undefined)?.usage;
    if (usage && hasAnyUsage(usage)) return usage;
  }
  return undefined;
}

/** Estimated context composition by message role. */
export type ContextBreakdown = {
  /** Tokens from user messages. */
  user: number;
  /** Assistant text + reasoning. */
  assistant: number;
  /** Tool calls + their results. */
  tools: number;
  /**
   * Visible parts with roles the meter does not classify. This does not
   * include hidden system prompt, skill blocks, tool definitions, provider
   * framing, or estimation drift.
   */
  other: number;
};

/**
 * Estimate the per-role composition of the visible transcript. This is not a
 * provider-token accounting API; it is the best client-side approximation of
 * what the current chat contents occupy before hidden runtime prompt parts.
 */
export function estimateContextBreakdown(
  messages: readonly MessageLike[]
): ContextBreakdown {
  let user = 0;
  let assistant = 0;
  let tools = 0;
  let other = 0;

  for (const m of messages) {
    const parts = m.parts ?? [];
    for (const part of parts) {
      const toks = estimatePartTokens(part);
      if (toks === 0) continue;
      if (m.role === "user") {
        user += toks;
      } else if (m.role === "assistant") {
        if (isToolPart(part)) tools += toks;
        else assistant += toks;
      } else {
        other += toks;
      }
    }
  }

  return { user, assistant, tools, other };
}

export type ContextUsage = {
  /** Estimated visible transcript tokens. */
  usedTokens: number;
  /** Model context window from the catalog (0 when unknown). */
  maxTokens: number;
  /** `usedTokens / maxTokens` in [0, 1]; 0 when the window is unknown. */
  percent: number;
  /** Estimated per-role composition (see {@link ContextBreakdown}). */
  breakdown: ContextBreakdown;
  /** The raw provider-reported last-turn usage, if any. */
  usage: MessageUsage | undefined;
  /** Provider-reported tokens consumed by the latest settled assistant turn. */
  turnUsageTokens: number;
};

/**
 * Compute everything the meter needs: the estimated context ring %, visible
 * role breakdown, and provider-reported last-turn usage. `contextWindow` is
 * the model's limit (from `@grida/ai-models`); pass 0/undefined when unknown
 * — `percent` is then 0 and the view hides itself.
 */
export function computeContextUsage(
  messages: readonly MessageLike[],
  contextWindow: number | undefined
): ContextUsage {
  const usage = lastAssistantUsage(messages);
  const turnUsageTokens = usage ? usageTokenTotal(usage) : 0;
  const breakdown = estimateContextBreakdown(messages);
  const usedTokens =
    breakdown.user + breakdown.assistant + breakdown.tools + breakdown.other;
  const maxTokens = contextWindow ?? 0;
  // Clamp to the documented [0, 1] contract; estimates can still exceed a
  // catalog window for stale model metadata or oversized local transcripts.
  const percent = maxTokens > 0 ? Math.min(1, usedTokens / maxTokens) : 0;
  return { usedTokens, maxTokens, percent, breakdown, usage, turnUsageTokens };
}
