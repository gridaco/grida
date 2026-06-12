/**
 * Session-layer row contract — the persisted chat-history shapes.
 *
 * These three tables (session → messages → parts) ARE the contract, not
 * a private IR: hosts read and render them directly. `store.ts` is the
 * CRUD surface that emits and accepts these shapes. Client-safe (plain
 * data, no node:* / drizzle imports), so the bridge can type its IPC
 * payloads against them.
 */

import type { ByokProviderId } from "../protocol/provider-ids";
import type { AgentModelId } from "../protocol/run";
import type { AgentMode } from "../protocol/mode";
import type { ModelTier } from "../tiers";

export type ChatModel = {
  /** A BYOK provider id or a configured endpoint provider id (#806). */
  provider_id: ByokProviderId | (string & {});
  tier?: ModelTier;
  model_id?: AgentModelId;
};

/**
 * A session-scoped permission rule (RFC `persistency / permission rule
 * shape`). Stored as a JSON array on `chat_sessions.permissions_json`.
 */
export type PermissionRule = {
  /** A tool id, capability name, or "*". */
  permission: string;
  /** Glob pattern matched against argv / paths / hosts. */
  pattern: string;
  action: "allow" | "deny" | "ask";
  source?: "manifest" | "session" | "project";
  /** Epoch ms; informational. */
  added_at?: number;
};

export type ChatSessionRow = {
  id: string;
  title: string;
  /** Free-form agent bucket. Grida's built-in agent sessions use "grida". */
  agent: string;
  workspace_id: string | null;
  model: ChatModel | null;
  /** Permission/supervision posture (RFC `permission modes`). Null on legacy
   *  rows predating the column — readers default to {@link AGENT_DEFAULT_MODE}. */
  mode: AgentMode | null;
  /** Parent session id when this session is a fork; null for roots. */
  parent_id: string | null;
  /** The forked-from user message id in the parent; null for roots. */
  parent_message_id: string | null;
  /** Session-scoped permission rules. `[]` when none. */
  permissions: PermissionRule[];
  metadata: Record<string, unknown>;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  cache_read: number;
  cache_write: number;
  total_tokens: number;
  cost_usd: number;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
};

export type ChatMessageRow = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  metadata: Record<string, unknown>;
  /** Epoch ms when soft-truncated by a rewind/compaction; null when visible. */
  hidden_at: number | null;
  created_at: number;
  updated_at: number;
};

export type ChatPartRow = {
  id: string;
  message_id: string;
  session_id: string;
  index: number;
  type: string;
  data: unknown;
  tool_call_id: string | null;
  tool_state: string | null;
  created_at: number;
  updated_at: number;
};

export type ChatMessageWithParts = ChatMessageRow & { parts: ChatPartRow[] };

/**
 * Per-turn token usage (RFC `session / context-window-tracking`).
 * Stored under an assistant message's `metadata.usage`; summed into the
 * session-row rollups. All five buckets count toward the context window.
 */
export type MessageUsage = {
  /** User + system tokens this step consumed (cache excluded). */
  input?: number;
  /** Tokens the model produced this step. */
  output?: number;
  /** Thinking-token charge, when the model emits one. */
  reasoning?: number;
  /** Tokens served from the provider's prompt cache. */
  cache_read?: number;
  /** Tokens written to the provider's prompt cache. */
  cache_write?: number;
};

export type SessionListFilter = {
  agent?: string;
  workspace_id?: string;
  query?: string;
  include_archived?: boolean;
  limit?: number;
  cursor?: string;
};

export type SessionListPage = {
  items: ChatSessionRow[];
  next_cursor: string | null;
};

export type CreateSessionOptions = {
  agent: string;
  workspace_id?: string;
  title?: string;
  model?: ChatModel;
  mode?: AgentMode;
  metadata?: Record<string, unknown>;
};

export type PatchSessionOptions = {
  title?: string;
  /** `true` archives, `false` unarchives. */
  archived?: boolean;
};

/** Arguments to {@link SessionsStore.fork} (RFC `session / fork API`). */
export type ForkSessionOptions = {
  parent_session_id: string;
  /** A `chat_messages.id` reachable (and visible) from the parent. */
  from_message_id: string;
  /** Merged into the new session's metadata. `ephemeral: true` = sidecar. */
  metadata?: Record<string, unknown>;
};

/** Result of {@link SessionsStore.rewind}. */
export type RewindResult = {
  /** The session that was rewound. */
  session_id: string;
  /** The message the conversation was rewound to (now the new tail). */
  to_message_id: string;
  /** How many messages were soft-hidden by this rewind. */
  hidden_count: number;
};
