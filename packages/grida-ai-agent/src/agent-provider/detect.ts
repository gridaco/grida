/**
 * Cheap, PATH-independent detection of the user's `claude` CLI (issue #813
 * zero-config onboarding). Answers ONE question — "is `claude` installed where
 * we can find it?" — by resolving the binary against the augmented PATH
 * ({@link ./path-resolve}). It deliberately does NOT verify login: that needs
 * the slow ACP handshake (spawn the bridge → `initialize` → `newSession`), and
 * for now login is surfaced by the first real run instead. Mirrors the
 * never-throws result shape of {@link ../providers/probe}.
 */
import { claude_path, type ResolveContext } from "./path-resolve";

export type ClaudeDetectResult = {
  /** `claude` resolved on the augmented PATH. NOT a login check. */
  installed: boolean;
  /** Absolute path of the resolved binary, when found. */
  path?: string;
};

/**
 * Resolve `claude` against the augmented PATH. Synchronous — a handful of
 * `statSync` probes is sub-millisecond, so the async ceremony probe.ts needs
 * for network isn't warranted here. `ctx` is injectable for tests; production
 * omits it.
 */
export function detectClaude(ctx: ResolveContext = {}): ClaudeDetectResult {
  const resolved = claude_path.resolve("claude", ctx);
  return resolved ? { installed: true, path: resolved } : { installed: false };
}
