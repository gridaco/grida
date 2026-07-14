/**
 * Run protocol — the request options a client sends to start an agent
 * run, plus the canonical agent-bucket id. Client-safe.
 */

import type { models, ModelTier } from "@grida/ai-models";
import type { ProviderId } from "./provider-ids";
import type { AgentMode } from "./mode";

export const AGENT_SESSION_AGENT = "grida" as const;

/**
 * SSE event name for the in-band session-id frame. `POST /agent/run` emits
 * this as the FIRST frame of the body, carrying `{ sessionId }`.
 *
 * This is the **sole** channel for session continuity. It deliberately
 * rides the response body, not a header: a browser renderer fetching the
 * loopback host cross-origin can only read a non-safelisted response header
 * when the host CORS-exposes it on the *streaming* response — a coupling
 * that silently regressed twice (renderer reads no id → every follow-up turn
 * mints a fresh session). The body frame always arrives, independent of CORS
 * and of any Electron fetch quirk.
 */
export const GRIDA_SESSION_SSE_EVENT = "grida-session" as const;

/**
 * A runnable model id: a catalog id, or a user-registered model id served
 * by a configured endpoint provider (issue #806 — e.g. `llama3.1:8b` on
 * Ollama). Open on the wire; the run-input boundary validates against
 * catalog ∪ registered ids, so an arbitrary string still 400s.
 */
export type AgentModelId = models.text.CatalogId | (string & {});

export type AgentRunMessagePart = {
  type: string;
} & Record<string, unknown>;

export type AgentRunMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: readonly AgentRunMessagePart[];
};

/**
 * One `scratch_seed` entry — a file the client asks the host to write into the
 * session scratch dir BEFORE the turn (WG `scratch.md` / `binary.md`). Two arms:
 *   - `{ path, text }`   — a UTF-8 text file (e.g. a `.canvas` bundle member).
 *   - `{ path, base64 }` — arbitrary bytes, base64-encoded (an uploaded PDF /
 *     zip / image the agent then reads or extracts by path via its shell).
 * `path` is a flat single segment; the host bounds the set and enforces
 * containment at write (`parseScratchSeed` / `writeScratchFile`).
 */
export type ScratchSeedEntry =
  | { path: string; text: string }
  | { path: string; base64: string };

/**
 * Canonical `scratch_seed` request ceilings.
 *
 * `maxTotalBytes` is the aggregate body size after decoding: UTF-8 bytes for
 * `text` entries and decoded bytes for canonical base64 entries. These are wire
 * protocol invariants, not host or UI policy. The server remains authoritative;
 * callers may use the same immutable values for early request preflight.
 */
export const SCRATCH_SEED_LIMITS = Object.freeze({
  maxFiles: 64,
  maxTotalBytes: 8 * 1024 * 1024,
} as const);

/**
 * A user's Allow/Deny on a paused supervised approval (RFC `permission modes`,
 * Phase 2). It rides the resume run-request body as a FIRST-CLASS field — not
 * smuggled inside a mutated assistant message — exactly like `mode`/`model_id`.
 * The server is the single source of truth for message state, so the answer
 * never needs to be SDK-part-shaped on the wire: the host validates it against
 * the persisted pending approval (`store.answerApproval`) before rebuilding the
 * model view. A forged answer (unknown call, wrong id, already-answered) is a
 * silent no-op.
 */
export type ApprovalAnswer = {
  tool_call_id: string;
  approval_id: string;
  approved: boolean;
  reason?: string;
};

export type AgentRunOptions = {
  messages: readonly AgentRunMessage[];
  tier?: ModelTier;
  /**
   * Explicit catalog model id (`creator/model`, e.g.
   * `"anthropic/claude-opus-4.7"`). When set, it overrides the
   * tier-to-model mapping; the agent host runs this exact model instead of
   * the one `tier` would resolve to.
   */
  model_id?: AgentModelId;
  /**
   * Explicit provider pick (issue #806). Validated server-side against
   * the allowed set; an unknown id 400s.
   */
  provider_id?: ProviderId;
  feature?: string;
  workspace_id?: string;
  /**
   * Permission/supervision posture for this turn (RFC `permission modes`).
   * Omitted ⇒ the host defaults to `accept-edits`. Persisted on the session so
   * a later queued-turn drain reuses the user's last-chosen mode.
   */
  mode?: AgentMode;
  /**
   * Whether the CLIENT making this run has a human UI that can answer the
   * locked `question` tool (RFC `tools` §question). Declared per run because one
   * daemon serves both — the desktop-from-web bridge (a human, `true`) and a
   * one-shot `cli run` (no UI, `false`). Omitted ⇒ falls back to the host's
   * `interactive` default. When false, `question` returns the fixed headless
   * refusal instead of pausing the run forever on a client that can't answer.
   */
  interactive?: boolean;
  /**
   * Resume answer for a paused supervised approval (RFC `permission modes`,
   * Phase 2). Present ONLY on the turn that answers an Allow/Deny; the host
   * applies it (`store.answerApproval`) before rebuilding the model view, then
   * the SDK resumes (Allow) or skips (Deny) the call. See {@link ApprovalAnswer}.
   */
  approval_answer?: ApprovalAnswer;
  /**
   * Files to seed into the session's scratch dir before the model turn (WG
   * `scratch.md` / `binary.md`) — an attachment (a picked slides template's
   * unzipped `.canvas` bundle, or an uploaded PDF/zip/image) lands in scratch,
   * NOT the user's workspace. Text or base64-binary entries ({@link
   * ScratchSeedEntry}); flat single-segment paths; the host bounds the set and
   * enforces containment at write (`parseScratchSeed` / `writeScratchFile`).
   * Forwarded verbatim in the run POST body (JSON), so every bridge layer that
   * whitelists run-option fields must also carry it.
   */
  scratch_seed?: ScratchSeedEntry[];
  /**
   * Optional persistent session id. When omitted, the agent host creates a
   * new chat session row and returns the id via the transport response.
   */
  session_id?: string;
};
