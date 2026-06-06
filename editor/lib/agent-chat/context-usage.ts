/**
 * Context-window usage — the data behind the desktop context meter.
 *
 * Pure + framework-free (no react, no AI-SDK imports) so the math is one
 * testable unit. The view (`scaffolds/desktop/shared/context-meter.tsx`)
 * memoizes {@link computeContextUsage} and renders the ring + popover.
 *
 * ## Two numbers, two sources of truth
 *
 * The ring **%** is REAL: it reads the provider-reported token usage the
 * agent sidecar stamps onto the latest assistant message
 * (`metadata.usage`, the `MessageUsage` shape from
 * `@grida/ai-agent`'s `session/rows.ts`) and divides by the model's
 * `contextWindow` from the catalog. This mirrors the system's own
 * compaction signal (`session.total_tokens` vs the model limit, see
 * `wg/ai/agent/session.md#context-window-tracking`).
 *
 * The role **breakdown** (user / assistant / tools / other) is
 * ESTIMATED. The provider reports tokens by *type* (input / output /
 * reasoning / cache), never by *who authored them*, so a per-role split
 * is impossible to read off the usage object. We approximate it the same
 * way the agent's own compactor does — chars/4 over each message's text
 * — and let `other` absorb the residual (the server-side system prompt,
 * skill blocks, tool definitions, and estimation drift), which is never
 * present in the client message list.
 *
 * This is the same shape opencode ships (`session-context-breakdown.ts`):
 * a real ring over an approximate, clearly-labeled composition.
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

/** All five buckets count toward the window (RFC `session`). */
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
   * Residual: the real used total minus the estimated roles above —
   * the server-side system prompt, skill blocks, tool definitions,
   * protocol overhead, and chars/4 drift. Clamped to ≥ 0.
   */
  other: number;
};

/**
 * Estimate the per-role composition of the context window. `user`,
 * `assistant`, and `tools` are chars/4 estimates over the visible
 * messages; `other` is whatever real used budget those estimates don't
 * account for (so the parts sum to at least `usedTokens`).
 */
export function estimateContextBreakdown(
  messages: readonly MessageLike[],
  usedTokens: number
): ContextBreakdown {
  let user = 0;
  let assistant = 0;
  let tools = 0;

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
      }
      // Other roles (system, synthetic) aren't shown verbatim client-side;
      // their tokens land in `other` via the residual below.
    }
  }

  const accounted = user + assistant + tools;
  const other = Math.max(0, usedTokens - accounted);
  return { user, assistant, tools, other };
}

export type ContextUsage = {
  /** Real provider-reported tokens in the current window (0 until the
   * first turn settles). */
  usedTokens: number;
  /** Model context window from the catalog (0 when unknown). */
  maxTokens: number;
  /** `usedTokens / maxTokens` in [0, 1]; 0 when the window is unknown. */
  percent: number;
  /** Estimated per-role composition (see {@link ContextBreakdown}). */
  breakdown: ContextBreakdown;
  /** The raw last-turn usage the ring is computed from, if any. */
  usage: MessageUsage | undefined;
};

/**
 * Compute everything the meter needs: the real ring %, and the estimated
 * role breakdown. `contextWindow` is the model's limit (from
 * `@grida/ai-models`); pass 0/undefined when unknown — `percent` is then 0
 * and the view hides itself.
 */
export function computeContextUsage(
  messages: readonly MessageLike[],
  contextWindow: number | undefined
): ContextUsage {
  const usage = lastAssistantUsage(messages);
  const usedTokens = usage ? usageTokenTotal(usage) : 0;
  const maxTokens = contextWindow ?? 0;
  const percent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const breakdown = estimateContextBreakdown(messages, usedTokens);
  return { usedTokens, maxTokens, percent, breakdown, usage };
}
