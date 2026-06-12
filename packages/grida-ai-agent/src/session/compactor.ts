/**
 * `compactor` — the compaction summarizer subagent (RFC
 * `session / compaction / summarizer cost discipline`,
 * `grida / agents-builtin / compactor`).
 *
 * A specialized subagent running the same model layer as the chat, under
 * strict cost discipline: cheapest tier, low temperature, hard output
 * cap, short timeout, no tools, one shot. Mirrors `titler`. Its input is
 * the soft-hidden history; its output is the Markdown summary that lands
 * in the `data-compaction` part.
 *
 * It deliberately `throw`s on failure (network / provider 5xx) rather
 * than swallowing — `compaction.ts` owns the retry + smart-recovery
 * ladder and needs to see the error.
 */

import { generateText } from "ai";
import type { ModelFactory } from "../agent";
import type { ModelTier } from "../tiers";

/** Cheapest tier the provider exposes (RFC: `nano` / `small`). */
const COMPACTOR_TIER: ModelTier = "nano";
// The cap must cover REASONING + the summary: on a thinking model the
// output budget includes the think stream, and a tight cap truncates
// before the Markdown summary lands. Non-thinking models stop at the
// summary length anyway, so the ceiling is free for them.
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `You compress a long agent/user conversation into a compact, faithful summary so the conversation can continue with less context.

Output a Markdown summary with these sections (omit a section only if truly empty):

## Goal
What the user is ultimately trying to accomplish.

## Progress
What has been done so far — files created/edited, decisions executed, tools run and their salient results.

## Decisions
Choices made and constraints established that later turns must respect.

## Next steps
What remains to be done.

Rules:
- Preserve concrete facts: file paths, identifiers, function/variable names, numeric values, error messages. These are load-bearing — do NOT paraphrase them away.
- Be terse. No preamble, no "Here is the summary". Start with the first heading.
- Do NOT invent progress that did not happen. If unsure, omit.
- Write in the same language as the conversation.`;

export namespace compactor {
  export type SummarizeOptions = {
    model_factory: ModelFactory;
    /** The conversation slice to summarize, already rendered to text. */
    history: string;
    /** Optional prior summary to fold in (chained compactions). */
    prior_summary?: string;
    max_output_tokens?: number;
    timeout_ms?: number;
    signal?: AbortSignal;
  };

  /**
   * One-shot summarize. Throws on model failure so the caller's
   * retry/recovery ladder can act. Returns the trimmed summary text.
   */
  export async function summarize(opts: SummarizeOptions): Promise<string> {
    const model = opts.model_factory(COMPACTOR_TIER);
    const prompt = opts.prior_summary
      ? `Earlier summary of this conversation:\n\n${opts.prior_summary}\n\n---\n\nConversation since then:\n\n${opts.history}`
      : opts.history;
    const signal =
      opts.signal ?? AbortSignal.timeout(opts.timeout_ms ?? DEFAULT_TIMEOUT_MS);
    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
      maxOutputTokens: opts.max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      abortSignal: signal,
    });
    return text.trim();
  }

  /** The `summarize` shape, as a function type for injection/testing. */
  export type Summarize = (opts: SummarizeOptions) => Promise<string>;
}
