/**
 * Compaction (RFC `session / compaction`).
 *
 * Replaces a stretch of conversation history with a summary, freeing
 * tokens for the next turn. Mandatory above the model's usable context —
 * an agent that "just stops working" at 100% context is shipping a bug.
 *
 * This module owns the *policy* (threshold, tail preservation, the
 * failure-recovery ladder) and orchestrates the store + the `compactor`
 * subagent. The summarizer is injected so the ladder is testable without
 * a model.
 *
 *   threshold  → shouldCompact()
 *   tail       → keep the last N turns verbatim, capped at a token budget
 *   summary    → compactor subagent over the head; data-compaction part
 *   recovery   → transient retry → tool-output prune → chunk → drop-middle
 */

import { models } from "@grida/ai-models";
import type { ModelFactory } from "../agent";
import type { ChatModel, ChatMessageWithParts } from "./rows";
import type { SessionsStore } from "./store";
import { compactor } from "./compactor";

/** Rough token estimate (RFC uses chars/4 as a portable approximation). */
const CHARS_PER_TOKEN = 4;
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Compaction config (RFC `session / compaction`; shape is normative). */
export type CompactionConfig = {
  /** Headroom kept for the next turn's output + reasoning. */
  reserve_tokens: number;
  /** Recent turns to keep verbatim. */
  tail_turns: number;
  /** Tail token budget as a fraction of usable context. */
  tail_budget_pct: number;
  /** Retry count on transient summarizer failure. */
  retry_on_transient: number;
  smart_recovery: {
    /** Try a tool-output prune before a real summarize. */
    prune_tool_outputs: boolean;
    /** Summarize in chunks if a one-shot won't fit. */
    chunked_summarize: boolean;
    /** Last resort: keep head + tail of the head, drop the middle. */
    drop_middle: boolean;
  };
};

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  reserve_tokens: 20_000,
  tail_turns: 2,
  tail_budget_pct: 0.25,
  retry_on_transient: 2,
  smart_recovery: {
    prune_tool_outputs: true,
    chunked_summarize: true,
    drop_middle: true,
  },
};

export type ModelLimits = {
  /** Total context window in tokens. */
  context_window: number;
  /** Max output tokens per response. */
  output_limit: number;
};

/** A model-limits resolver. The default ({@link resolveModelLimits} with
 *  no custom list) only knows the static catalog; hosts with registered
 *  endpoint models inject a registry-aware one (see `AgentRuntime`). */
export type ResolveModelLimits = (model: ChatModel | null) => ModelLimits;

/**
 * Resolve a session's model limits over catalog ∪ `custom` (the open-
 * registry seam, issue #806). Falls back to the default tier when the
 * model can't be resolved — note this fallback assumes a frontier-sized
 * window, which is why registered local models MUST resolve through
 * `custom` rather than land here (an 8k local model treated as 1M never
 * compacts and dies on context overflow).
 */
export function resolveModelLimits(
  model: ChatModel | null,
  custom?: readonly models.text.registry.CustomModelSpec[]
): ModelLimits {
  let spec: { contextWindow: number; outputLimit: number } | undefined =
    model?.model_id
      ? models.text.registry.resolve(model.model_id, custom)
      : undefined;
  if (!spec && model?.tier) spec = models.text.byTier[model.tier];
  if (!spec) spec = models.text.byTier.pro;
  return { context_window: spec.contextWindow, output_limit: spec.outputLimit };
}

/** Usable context = window − reserve. `reserve` is capped at the model's
 *  output limit (no point reserving more than it can emit). */
export function usableContext(
  limits: ModelLimits,
  config: CompactionConfig
): number {
  const reserve = Math.min(config.reserve_tokens, limits.output_limit);
  return Math.max(0, limits.context_window - reserve);
}

/** True when the session's context use has reached the usable ceiling. */
export function shouldCompact(
  contextWindowUsed: number,
  limits: ModelLimits,
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG
): boolean {
  return contextWindowUsed >= usableContext(limits, config);
}

// ─────────────────────────── rendering ───────────────────────────

/** Render one message's parts to a compact text block for the summarizer. */
export function renderMessage(
  msg: ChatMessageWithParts,
  opts: { drop_tool_outputs?: boolean } = {}
): string {
  const lines: string[] = [`[${msg.role}]`];
  for (const part of msg.parts) {
    const data = part.data as Record<string, unknown> | null;
    if (!data) continue;
    const type = part.type;
    if (type === "text" && typeof data.text === "string") {
      lines.push(data.text);
    } else if (type === "reasoning" && typeof data.text === "string") {
      // Reasoning is verbose and low-signal for a summary; keep a stub.
      lines.push("(reasoning omitted)");
    } else if (type === "data-compaction") {
      const inner = (data.data ?? {}) as { summary?: string };
      if (inner.summary) lines.push(inner.summary);
    } else if (type.startsWith("tool-") || type === "dynamic-tool") {
      const name =
        (data.toolName as string | undefined) ??
        (data.tool_name as string | undefined) ??
        type.replace(/^tool-/, "");
      const input = data.input !== undefined ? compactJson(data.input) : "";
      lines.push(`(tool: ${name}${input ? ` ${input}` : ""})`);
      if (!opts.drop_tool_outputs && data.output !== undefined) {
        lines.push(`→ ${compactJson(data.output)}`);
      } else if (opts.drop_tool_outputs && data.output !== undefined) {
        lines.push("→ <output pruned>");
      }
    }
  }
  return lines.join("\n");
}

function compactJson(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s.length > 600 ? s.slice(0, 600) + "…" : s;
  } catch {
    return String(value);
  }
}

function renderMessages(
  msgs: ChatMessageWithParts[],
  opts: { drop_tool_outputs?: boolean } = {}
): string {
  return msgs.map((m) => renderMessage(m, opts)).join("\n\n");
}

// ─────────────────────────── tail split ───────────────────────────

export type TailSplit = {
  head: ChatMessageWithParts[];
  tail: ChatMessageWithParts[];
  /** The first message kept verbatim (tail[0]). */
  tail_start: ChatMessageWithParts | null;
  /** Effective number of turns kept (may drop from config when over budget). */
  kept_turns: number;
};

/**
 * Split visible messages into a head to summarize and a tail to keep
 * verbatim. Keeps the last `tailTurns` user-led turns; if that tail
 * exceeds the budget, drops to 1 turn (RFC default: "drop to N=1 and
 * warn").
 */
export function splitTail(
  messages: ChatMessageWithParts[],
  limits: ModelLimits,
  config: CompactionConfig
): TailSplit {
  const userIdx: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === "user") userIdx.push(i);
  });
  const budget = usableContext(limits, config) * config.tail_budget_pct;

  const splitAt = (turns: number): number => {
    if (userIdx.length <= turns) return 0; // whole thing is tail
    return userIdx[userIdx.length - turns];
  };

  let turns = Math.max(1, config.tail_turns);
  let start = splitAt(turns);
  let tail = messages.slice(start);
  if (estimateTokens(renderMessages(tail)) > budget && turns > 1) {
    turns = 1;
    start = splitAt(turns);
    tail = messages.slice(start);
  }
  const head = messages.slice(0, start);
  return {
    head,
    tail,
    tail_start: tail[0] ?? null,
    kept_turns: Math.min(turns, userIdx.length),
  };
}

// ─────────────────────────── orchestration ───────────────────────────

export type CompactionDeps = {
  store: SessionsStore;
  model_factory: ModelFactory;
  /** Injected summarizer (defaults to the real `compactor.summarize`). */
  summarize?: compactor.Summarize;
  /** Injected model-limits resolver (defaults to the catalog-only
   *  {@link resolveModelLimits}). Hosts with registered endpoint models
   *  inject a registry-aware one so local-model windows resolve real. */
  resolve_limits?: ResolveModelLimits;
  /** Warning sink. Defaults to console.warn. */
  on_warn?: (message: string) => void;
};

export type CompactSessionOptions = {
  session_id: string;
  /** false = user-fired (manual). true = auto-fired on overflow. */
  auto: boolean;
  config?: CompactionConfig;
  signal?: AbortSignal;
  /**
   * The summarizer's input cap — head bigger than this triggers the
   * smart-recovery ladder. Defaults to the nano model's window. Tests
   * pass a small value to exercise recovery.
   */
  summarizer_input_cap?: number;
};

export type CompactionResult =
  | {
      compacted: true;
      summary_message_id: string;
      /** First message kept verbatim, or `null` when nothing was kept
       *  (manual `/compact` summarizes everything). */
      tail_start_id: string | null;
      /** How many turns the summary stands in for. */
      summarized_count: number;
      summary_tokens: number;
      kept_turns: number;
      strategy: "one-shot" | "pruned" | "chunked" | "drop-middle";
    }
  | { compacted: false; reason: string };

/**
 * Compact a session. Loads the live transcript, summarizes the head via the
 * compactor subagent (with the failure ladder), and APPENDS a `data-compaction`
 * summary marker at the bottom (the summarized head stays visible — the model
 * boundary is resolved at read-time from the marker's `tail_start_id`). Auto
 * keeps a rolling verbatim tail; manual summarizes everything. A no-op (returns
 * `compacted: false`) when there's nothing to compact or the summarizer
 * exhausts its retries.
 */
export async function compactSession(
  deps: CompactionDeps,
  opts: CompactSessionOptions
): Promise<CompactionResult> {
  const warn = deps.on_warn ?? ((m: string) => console.warn(m));
  const summarize = deps.summarize ?? compactor.summarize;
  const config = opts.config ?? DEFAULT_COMPACTION_CONFIG;

  const session = await deps.store.get(opts.session_id);
  if (!session) return { compacted: false, reason: "session-not-found" };
  const limits = (deps.resolve_limits ?? resolveModelLimits)(session.model);

  const messages = await deps.store.listVisibleMessages(opts.session_id);

  // Split the head (summarized) from the tail (kept verbatim for the model):
  //   - Auto fires on overflow and keeps a rolling verbatim tail (config.tailTurns).
  //   - Manual is user-fired ("just compact"): summarize EVERYTHING up to the
  //     invocation point — no verbatim tail. The marker lands at the bottom and
  //     the model continues from the summary alone.
  let head: ChatMessageWithParts[];
  let tailStartId: string | null;
  let keptTurns: number;
  if (opts.auto) {
    const split = splitTail(messages, limits, config);
    head = split.head;
    tailStartId = split.tail_start?.id ?? null;
    keptTurns = split.kept_turns;
  } else {
    head = messages;
    tailStartId = null;
    keptTurns = 0;
  }

  // The head may itself contain a prior compaction summary — fold it in and
  // exclude it from the body so the summarizer sees clean text. If nothing but
  // a prior summary remains, there's nothing new to compact.
  const priorSummary = extractPriorSummary(head);
  const headForSummary = head.filter((m) => !messageHasCompaction(m));
  if (headForSummary.length === 0) {
    return { compacted: false, reason: "nothing-to-compact" };
  }

  const cap =
    opts.summarizer_input_cap ?? models.text.byTier.nano.contextWindow;

  let summary: string;
  let strategy: "one-shot" | "pruned" | "chunked" | "drop-middle";
  try {
    const ladder = await summarizeWithRecovery({
      head: headForSummary,
      prior_summary: priorSummary,
      cap,
      config,
      summarize,
      model_factory: deps.model_factory,
      signal: opts.signal,
      warn,
    });
    if (!ladder) {
      // Transient failures exhausted → proceed WITHOUT compaction.
      warn(
        `[compaction] summarizer failed; proceeding without compaction for ${opts.session_id}`
      );
      return { compacted: false, reason: "summarizer-failed" };
    }
    summary = ladder.summary;
    strategy = ladder.strategy;
  } catch (err) {
    if (opts.signal?.aborted) return { compacted: false, reason: "aborted" };
    warn(
      `[compaction] hard failure for ${opts.session_id}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { compacted: false, reason: "history-too-large" };
  }

  const summaryTokens = estimateTokens(summary);
  const { summary_message_id: summaryMessageId } =
    await deps.store.applyCompaction({
      session_id: opts.session_id,
      summary,
      tail_start_id: tailStartId,
      auto: opts.auto,
      summary_tokens: summaryTokens,
    });

  return {
    compacted: true,
    summary_message_id: summaryMessageId,
    tail_start_id: tailStartId,
    summarized_count: head.length,
    summary_tokens: summaryTokens,
    kept_turns: keptTurns,
    strategy,
  };
}

type LadderResult = {
  summary: string;
  strategy: "one-shot" | "pruned" | "chunked" | "drop-middle";
};

/**
 * Run the summarizer with the RFC failure-recovery ladder. Returns null
 * when transient retries are exhausted (caller proceeds uncompacted);
 * throws only on a genuine hard failure the recovery can't handle.
 */
async function summarizeWithRecovery(args: {
  head: ChatMessageWithParts[];
  prior_summary?: string;
  cap: number;
  config: CompactionConfig;
  summarize: compactor.Summarize;
  model_factory: ModelFactory;
  signal?: AbortSignal;
  warn: (m: string) => void;
}): Promise<LadderResult | null> {
  const { config, summarize, model_factory: modelFactory, signal } = args;

  const tryOnce = async (history: string): Promise<string | null> => {
    let attempt = 0;
    for (;;) {
      try {
        return await summarize({
          model_factory: modelFactory,
          history,
          prior_summary: args.prior_summary,
          signal,
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        attempt += 1;
        if (attempt > config.retry_on_transient) return null; // exhausted
        await backoff(attempt);
      }
    }
  };

  const fullText = renderMessages(args.head);
  if (estimateTokens(fullText) <= args.cap) {
    const summary = await tryOnce(fullText);
    return summary === null ? null : { summary, strategy: "one-shot" };
  }

  // Spec-limit path: history exceeds the summarizer's input cap.
  // 1. tool-output prune.
  if (config.smart_recovery.prune_tool_outputs) {
    const pruned = renderMessages(args.head, { drop_tool_outputs: true });
    if (estimateTokens(pruned) <= args.cap) {
      const summary = await tryOnce(pruned);
      return summary === null ? null : { summary, strategy: "pruned" };
    }
  }

  // 2. chunked summarize: summarize each cap-sized chunk, fold forward.
  if (config.smart_recovery.chunked_summarize) {
    const chunks = chunkMessages(args.head, args.cap);
    let rolling = args.prior_summary;
    for (const chunk of chunks) {
      const text = renderMessages(chunk);
      let attempt = 0;
      let piece: string | null = null;
      for (;;) {
        try {
          piece = await summarize({
            model_factory: modelFactory,
            history: text,
            prior_summary: rolling,
            signal,
          });
          break;
        } catch (err) {
          if (signal?.aborted) throw err;
          attempt += 1;
          if (attempt > config.retry_on_transient) return null;
          await backoff(attempt);
        }
      }
      rolling = piece ?? rolling;
    }
    if (rolling) return { summary: rolling, strategy: "chunked" };
  }

  // 3. drop the middle: keep head's head + tail, summarize that.
  if (config.smart_recovery.drop_middle) {
    const keep = Math.max(1, Math.floor(args.head.length / 4));
    const trimmed = [
      ...args.head.slice(0, keep),
      ...args.head.slice(args.head.length - keep),
    ];
    const text = renderMessages(trimmed);
    const summary = await tryOnce(text);
    return summary === null ? null : { summary, strategy: "drop-middle" };
  }

  // Nothing left to try.
  throw new Error("history exceeds summarizer input cap and recovery is off");
}

/** Split messages into chunks whose rendered size stays under `cap`. */
function chunkMessages(
  msgs: ChatMessageWithParts[],
  cap: number
): ChatMessageWithParts[][] {
  const chunks: ChatMessageWithParts[][] = [];
  let current: ChatMessageWithParts[] = [];
  let size = 0;
  for (const m of msgs) {
    const t = estimateTokens(renderMessage(m));
    if (size + t > cap && current.length > 0) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(m);
    size += t;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function messageHasCompaction(m: ChatMessageWithParts): boolean {
  return m.parts.some((p) => p.type === "data-compaction");
}

function extractPriorSummary(head: ChatMessageWithParts[]): string | undefined {
  // The most recent prior compaction summary in the head, if any.
  for (let i = head.length - 1; i >= 0; i -= 1) {
    for (const part of head[i].parts) {
      if (part.type === "data-compaction") {
        const data = part.data as { data?: { summary?: string } } | null;
        const summary = data?.data?.summary;
        if (typeof summary === "string") return summary;
      }
    }
  }
  return undefined;
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(2000, 100 * 2 ** attempt);
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────── tool-output prune ───────────────────────────

/**
 * Tool-output pruning (RFC `session / tool-output pruning vs compaction`):
 * a cheaper pass that erases large completed tool-call OUTPUTS (keeping
 * the input + a stub) without summarizing. Walks backwards, preserving
 * the most recent `keepRecent` tool calls. Returns how many outputs were
 * pruned. Useful before a real compaction, or on its own at a lower
 * threshold.
 */
export async function pruneToolOutputs(
  store: SessionsStore,
  opts: {
    session_id: string;
    /** Keep the N most recent tool outputs intact. Default 5. */
    keep_recent?: number;
    /** Only prune outputs whose JSON exceeds this char length. Default 400. */
    min_chars?: number;
  }
): Promise<{ pruned_count: number }> {
  const keepRecent = opts.keep_recent ?? 5;
  const minChars = opts.min_chars ?? 400;
  const messages = await store.listVisibleMessages(opts.session_id);

  // Collect completed tool-output parts in order.
  const toolParts: Array<{
    message_id: string;
    part: ChatMessageWithParts["parts"][number];
  }> = [];
  for (const m of messages) {
    for (const part of m.parts) {
      if (
        (part.type.startsWith("tool-") || part.type === "dynamic-tool") &&
        part.tool_state === "output-available"
      ) {
        toolParts.push({ message_id: m.id, part });
      }
    }
  }
  // Protect the most recent `keepRecent`.
  const prunable = toolParts.slice(
    0,
    Math.max(0, toolParts.length - keepRecent)
  );
  let prunedCount = 0;
  for (const { message_id: messageId, part } of prunable) {
    const data = part.data as Record<string, unknown> | null;
    if (!data || data.output === undefined) continue;
    const size = safeLen(data.output);
    if (size < minChars) continue;
    const next = {
      ...data,
      output: {
        pruned: true,
        note: `<output pruned, ~${estimateTokens(
          safeStringify(data.output)
        )} tokens>`,
      },
    };
    await store.upsertPart(messageId, {
      index: part.index,
      type: part.type,
      data: next,
      tool_call_id: part.tool_call_id,
      tool_state: part.tool_state,
      session_id: opts.session_id,
    });
    prunedCount += 1;
  }
  return { pruned_count: prunedCount };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return String(v);
  }
}
function safeLen(v: unknown): number {
  return safeStringify(v).length;
}
