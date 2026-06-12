/**
 * Session title generator.
 *
 * Generates a short semantic title from the first user message. The
 * sessions store owns persistence; this module owns title prompting,
 * sanitization, timeout, and idempotency.
 */

import { generateText } from "ai";
import type { ModelFactory } from "../agent";
import type { SessionsStore } from "./store";
import { session_title } from "./title";

const MAX_TITLE_LEN = 60;

const SYSTEM_PROMPT = `You generate short titles for chat conversations.

Rules:
- Output ONLY the title text. No quotes, no markdown, no code, no trailing punctuation.
- Maximum 8 words AND 50 characters. Shorter is better.
- The title MUST be in the same language as the user message.
- Capture the user's intent (what they want to do), not tool names or chitchat.
- Do NOT answer or respond to the message. Only summarize the intent.
- Do NOT include the words "title" or "summary".
- For minimal / conversational input, produce a short, sensible label.`;

export namespace titler {
  export type GenerateOptions = {
    model_factory: ModelFactory;
    /** First user message text. Truncated internally if very long. */
    user_text: string;
    /** Optional cancellation (e.g. a timeout signal). */
    signal?: AbortSignal;
  };

  export async function generate(
    opts: GenerateOptions
  ): Promise<string | null> {
    const prompt = truncate(opts.user_text.trim(), 2000);
    if (prompt.length === 0) return null;
    try {
      const model = opts.model_factory("nano");
      const { text } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0.3,
        // The cap must cover REASONING + text: on a thinking model
        // (e.g. a local Ollama reasoning model) `completion_tokens`
        // includes the think stream, and a tight cap is consumed before
        // any title text lands (`finish_reason: length`, empty content).
        // 512 leaves thinking headroom; a non-thinking nano stops at
        // ~10 tokens anyway, so the ceiling costs nothing.
        maxOutputTokens: 512,
        abortSignal: opts.signal,
      });
      return sanitize(text);
    } catch {
      return null;
    }
  }

  export type MaybeGenerateOptions = {
    store: SessionsStore;
    session_id: string;
    model_factory: ModelFactory;
    /** First user message text — caller extracts from the request body. */
    user_text: string;
    /** Hard timeout for the title gen call. Defaults to 60s — generous
     *  because the call is fire-and-forget (a ceiling, not a wait): fast
     *  hosted nanos finish in ~1s, while a local single-flight server
     *  (Ollama) may queue the titler behind the main turn. */
    timeout_ms?: number;
  };

  export async function maybeGenerate(
    opts: MaybeGenerateOptions
  ): Promise<string | null> {
    const before = await opts.store.get(opts.session_id);
    if (!before) return null;
    if (!session_title.isDefault(before.title)) return null;

    const signal = AbortSignal.timeout(opts.timeout_ms ?? 60_000);
    const title = await generate({
      model_factory: opts.model_factory,
      user_text: opts.user_text,
      signal,
    });
    if (!title) return null;

    const after = await opts.store.get(opts.session_id);
    if (!after || !session_title.isDefault(after.title)) return null;
    await opts.store.rename(opts.session_id, title);
    return title;
  }

  export function sanitize(raw: string): string | null {
    let s = raw ?? "";
    s = s.replace(/<think>[\s\S]*?<\/think>/g, "");
    const line = s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!line) return null;
    let cleaned = line
      .replace(/^[\s"'`‘’“”]+/, "")
      .replace(/[\s"'`‘’“”]+$/, "")
      .replace(/[.!?…]+$/, "")
      .trim();
    if (cleaned.length === 0) return null;
    if (cleaned.length > MAX_TITLE_LEN) {
      cleaned = cleaned.slice(0, MAX_TITLE_LEN - 1).trimEnd() + "…";
    }
    return cleaned;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
