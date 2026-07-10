/**
 * Test-only e2e harness pieces shared across the package's suites (the
 * `src/testing/` home — imported by `*.test.ts` files only, never a
 * published entrypoint).
 */

/** A well-formed V3 `finish` stream part for `MockLanguageModelV3` fixtures. */
export const FINISH_USAGE = {
  type: "finish" as const,
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: {
      total: 10,
      noCache: 10,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 5, text: 5, reasoning: undefined },
  },
};

/** Poll `fn` until it stops throwing (the recorder's async write chain,
 * fs side effects) or `timeoutMs` elapses — then rethrow the last failure. */
export async function waitFor(
  fn: () => Promise<void>,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await fn();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 15));
    }
  }
}

/** The last user turn's text from a V3 model prompt — how mock models key
 * their scripted behavior off the test's trigger phrases. */
export function lastUserText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return "";
  for (let i = prompt.length - 1; i >= 0; i -= 1) {
    const m = prompt[i] as { role?: string; content?: unknown };
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((p) => (p as { text?: string }).text ?? "")
        .join(" ");
    }
  }
  return "";
}
