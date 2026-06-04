/**
 * Run protocol — the request options a client sends to start an agent
 * run, plus the canonical agent-bucket id. Client-safe.
 */

import type { models, ModelTier } from "@grida/ai-models";
import type { ByokProviderId } from "./provider-ids";
import type { SkillId } from "./skills";

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

export type AgentModelId = models.text.CatalogId;

export type AgentRunMessagePart = {
  type: string;
} & Record<string, unknown>;

export type AgentRunMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: readonly AgentRunMessagePart[];
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
  provider_id?: ByokProviderId;
  feature?: string;
  workspace_id?: string;
  skills?: readonly SkillId[];
  /**
   * Optional persistent session id. When omitted, the agent host creates a
   * new chat session row and returns the id via the transport response.
   */
  session_id?: string;
};
