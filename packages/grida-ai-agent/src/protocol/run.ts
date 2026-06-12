/**
 * Run protocol — the request options a client sends to start an agent
 * run, plus the canonical agent-bucket id. Client-safe.
 */

import type { models, ModelTier } from "@grida/ai-models";
import type { ByokProviderId } from "./provider-ids";
import type { SkillId } from "./skills";
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
   * Explicit provider pick: a BYOK provider id or a configured endpoint
   * provider id (issue #806). Validated server-side against the allowed
   * set; an unknown id 400s.
   */
  provider_id?: ByokProviderId | (string & {});
  feature?: string;
  workspace_id?: string;
  skills?: readonly SkillId[];
  /**
   * Permission/supervision posture for this turn (RFC `permission modes`).
   * Omitted ⇒ the host defaults to `accept-edits`. Persisted on the session so
   * a later queued-turn drain reuses the user's last-chosen mode.
   */
  mode?: AgentMode;
  /**
   * Resume answer for a paused supervised approval (RFC `permission modes`,
   * Phase 2). Present ONLY on the turn that answers an Allow/Deny; the host
   * applies it (`store.answerApproval`) before rebuilding the model view, then
   * the SDK resumes (Allow) or skips (Deny) the call. See {@link ApprovalAnswer}.
   */
  approval_answer?: ApprovalAnswer;
  /**
   * Optional persistent session id. When omitted, the agent host creates a
   * new chat session row and returns the id via the transport response.
   */
  session_id?: string;
};
