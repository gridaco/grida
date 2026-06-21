/**
 * Agent run request boundary.
 *
 * Converts the loose HTTP body into the internal run request shape.
 * Runtime orchestration receives a typed request and does not own
 * catalog/provider/workspace validation details.
 */

import crypto from "node:crypto";
import { models } from "@grida/ai-models";
import type {
  AgentModelId,
  AgentRunMessagePart,
  ApprovalAnswer,
} from "../protocol/run";
import { AGENT_SKILL_IDS, type SkillId } from "../protocol/skills";
import {
  AGENT_DEFAULT_MODE,
  asAgentMode,
  type AgentMode,
} from "../protocol/mode";
import { AGENT_DEFAULT_TIER, AGENT_TIERS, type ModelTier } from "../tiers";
import type { SessionsStore } from "../session/store";
import type { WorkspaceRegistry } from "../workspaces";
import {
  isKnownProviderId,
  type EndpointProvidersStore,
} from "../providers/endpoints";
// Neutral (no node/SDK) import — just the synthetic-model-id contract.
import { isAgentProviderModel } from "../agent-provider/types";

const ALLOWED_TIERS = new Set<string>(AGENT_TIERS);
const CATALOG_MODEL_IDS = new Set<string>(Object.keys(models.text.catalog));
const ALLOWED_ROLES = new Set<string>(["user", "assistant", "system"]);
const ALLOWED_SKILL_IDS = new Set<string>(AGENT_SKILL_IDS);

export type NormalizedMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: AgentRunMessagePart[];
};

export type RunRequest = {
  messages: NormalizedMessage[];
  tier: ModelTier;
  /** Explicit model id (catalog or registered); overrides the tier→model
   *  mapping. */
  model_id?: AgentModelId;
  /** Explicit provider pick: BYOK id or configured endpoint id. */
  explicit?: string;
  feature?: string;
  workspace_id?: string;
  workspace_root?: string;
  skills?: SkillId[];
  /** Permission/supervision posture; defaults to `accept-edits` when absent. */
  mode: AgentMode;
  /** Resume answer for a paused supervised approval; absent on a normal turn. */
  approval_answer?: ApprovalAnswer;
  session_id?: string;
};

export type ParseRunBodyDeps = {
  workspace_registry: WorkspaceRegistry;
  /** Endpoint provider configs (issue #806). When present, registered
   *  model ids and endpoint provider ids join the allowed sets. */
  endpoints?: EndpointProvidersStore;
};

export async function parseRunBody(
  body: unknown,
  deps: ParseRunBodyDeps
): Promise<RunRequest | Response> {
  const b = (body ?? {}) as {
    messages?: unknown;
    tier?: unknown;
    model_id?: unknown;
    provider_id?: unknown;
    feature?: unknown;
    workspace_id?: unknown;
    skills?: unknown;
    mode?: unknown;
    approval_answer?: unknown;
    session_id?: unknown;
  };
  const messages = normalizeWireMessages(b.messages);
  if (messages === null) {
    return Response.json(
      {
        error:
          "messages must be an array of {role, content} or {role, parts} objects",
      },
      { status: 400 }
    );
  }
  const tier: ModelTier =
    typeof b.tier === "string" && ALLOWED_TIERS.has(b.tier)
      ? (b.tier as ModelTier)
      : AGENT_DEFAULT_TIER;
  let modelId: AgentModelId | undefined;
  if (b.model_id !== undefined) {
    // Allowed model ids = static catalog ∪ user-registered endpoint
    // models (the open-registry seam, issue #806). Still a closed gate:
    // an id neither table knows 400s.
    const allowed =
      typeof b.model_id === "string" &&
      (CATALOG_MODEL_IDS.has(b.model_id) ||
        isAgentProviderModel(b.model_id) || // issue #813 agent-provider class
        (await isRegisteredModelId(b.model_id, deps)));
    if (!allowed) {
      return Response.json(
        { error: `modelId not allowed: ${String(b.model_id)}` },
        { status: 400 }
      );
    }
    modelId = b.model_id as AgentModelId;
  }
  let explicit: string | undefined;
  if (b.provider_id !== undefined) {
    const providerId = typeof b.provider_id === "string" ? b.provider_id : "";
    const allowed =
      providerId.length > 0 &&
      (await isKnownProviderId(providerId, deps.endpoints));
    if (!allowed) {
      return Response.json(
        { error: `providerId not allowed: ${String(b.provider_id)}` },
        { status: 400 }
      );
    }
    explicit = providerId;
  }
  let workspaceId: string | undefined;
  let workspaceRoot: string | undefined;
  if (b.workspace_id !== undefined) {
    if (typeof b.workspace_id !== "string" || b.workspace_id.length === 0) {
      return Response.json(
        { error: "workspaceId must be a non-empty string" },
        { status: 400 }
      );
    }
    const ws = await deps.workspace_registry.findById(b.workspace_id);
    if (!ws) {
      return Response.json(
        {
          error: `workspace not found: ${b.workspace_id}`,
          code: "workspace-not-found",
        },
        { status: 404 }
      );
    }
    workspaceId = b.workspace_id;
    workspaceRoot = ws.root;
  }
  return {
    messages,
    tier,
    model_id: modelId,
    explicit,
    feature: typeof b.feature === "string" ? b.feature : undefined,
    workspace_id: workspaceId,
    workspace_root: workspaceRoot,
    skills: coerceSkills(b.skills),
    // Unknown/absent mode coerces to the conservative default. An invalid
    // string is treated as absent rather than rejected — the supervision
    // posture should fail safe, not 400 the whole turn.
    mode: asAgentMode(b.mode) ?? AGENT_DEFAULT_MODE,
    // A malformed approval answer is treated as absent (no resume), never a
    // 400 — and `store.answerApproval` re-validates it against the persisted
    // pending approval regardless, so a forged answer is a no-op.
    approval_answer: coerceApprovalAnswer(b.approval_answer),
    session_id:
      typeof b.session_id === "string" && b.session_id.length > 0
        ? b.session_id
        : undefined,
  };
}

async function isRegisteredModelId(
  modelId: string,
  deps: ParseRunBodyDeps
): Promise<boolean> {
  if (!deps.endpoints) return false;
  const registered = await deps.endpoints.registeredModels();
  return registered.some((m) => m.id === modelId);
}

/**
 * The id of the user message a direct `/agent/run` fires — the LAST
 * user-role message of the incoming array (the AI SDK client resends the
 * full history each turn; the tail is the new message). This is the
 * fired-message identity the `turn-started` lifecycle event carries (RFC
 * `turn-authority`). `undefined` when the array holds no user message.
 */
export function extractLastUserMessageId(
  msgs: NormalizedMessage[]
): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    if (msgs[i].role === "user") return msgs[i].id;
  }
  return undefined;
}

export function extractFirstUserText(msgs: NormalizedMessage[]): string {
  for (const m of msgs) {
    if (m.role !== "user") continue;
    const text = m.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
}

/**
 * The latest user message's text — the prompt for an agent-provider turn
 * (issue #813). The client resends full history; the tail user message is the
 * new turn. Mirrors {@link extractFirstUserText} but walks from the end.
 */
export function extractLastUserText(msgs: NormalizedMessage[]): string {
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m.role !== "user") continue;
    const text = m.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
}

export async function persistIncomingTail(
  store: SessionsStore,
  sessionId: string,
  incoming: NormalizedMessage[]
): Promise<void> {
  // Ids already persisted for this session. The AI SDK client resends
  // the full history with stable ids every turn, so most incoming ids
  // are already here and skip below. Doubles as the intra-request dedup
  // set — a client DB-hydration race can place the same user message in
  // one outgoing array twice — so we record each id as we go.
  const seen = new Set(await store.listMessageIds(sessionId));
  for (const m of incoming) {
    if (m.role === "assistant") {
      // The recorder owns assistant messages — it writes them from the model
      // stream. The ONE thing the stream can't carry is a CLIENT-resolved tool
      // result: a session with no server-side fs (the desktop file window's
      // single-file sidebar) resolves fs tools in the renderer, and the result
      // arrives only on the next request's assistant message. Fill just those
      // into the existing (recorder-written) tool row so the server-authoritative
      // model view (`buildModelMessages`) stops dropping the call as incomplete.
      await persistResolvedToolResults(store, m);
      continue;
    }
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    // Idempotent insert: a concurrent run on the same session can land
    // this id between the snapshot above and now (the client may re-POST
    // /agent/run while one is still in flight). ON CONFLICT DO NOTHING
    // turns that race into a no-op instead of a UNIQUE-constraint 500.
    await store.appendMessageIfAbsent(sessionId, { id: m.id, role: m.role });
    // Parts are keyed by (messageId, index) — upsert is idempotent, so a
    // re-send refreshes content without duplicating rows.
    for (let i = 0; i < m.parts.length; i += 1) {
      const part = m.parts[i];
      await store.upsertPart(m.id, { index: i, type: part.type, data: part });
    }
  }
}

/**
 * Fill the CLIENT-resolved tool results carried on an incoming assistant
 * message into their existing (recorder-written) rows — see
 * {@link SessionsStore.fillToolResult} for the in-place, never-overwrite,
 * never-reindex semantics. Only terminal tool parts
 * (`output-available` / `output-error`) are considered; non-tool parts (text,
 * reasoning) and already-resolved rows are left to the recorder.
 *
 * GRIDA-SEC-004: the loopback's trusted renderer supplies a result only for a
 * call the server delegated to it and is still waiting on (the `WHERE
 * tool_state = 'input-available'` guard); it cannot inject or rewrite anything
 * else.
 */
async function persistResolvedToolResults(
  store: SessionsStore,
  message: NormalizedMessage
): Promise<void> {
  for (const part of message.parts) {
    const toolCallId = toolCallIdOf(part);
    if (toolCallId === null || !isResolvedToolPart(part)) continue;
    await store.fillToolResult(message.id, toolCallId, {
      type: part.type,
      data: part,
      // `isResolvedToolPart` already verified this is a terminal-state string.
      tool_state: (part as { state?: unknown }).state as string,
    });
  }
}

/** A terminal tool part — the only assistant part a client authors that the
 *  model stream never carried. */
function isResolvedToolPart(part: AgentRunMessagePart): boolean {
  if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
    return false;
  }
  const state = (part as { state?: unknown }).state;
  return state === "output-available" || state === "output-error";
}

/** The tool call id off an incoming part, tolerating camel/snake (the AI SDK
 *  client sends `toolCallId`; the persisted shape uses `tool_call_id`). */
function toolCallIdOf(part: AgentRunMessagePart): string | null {
  const p = part as { toolCallId?: unknown; tool_call_id?: unknown };
  const id = typeof p.toolCallId === "string" ? p.toolCallId : p.tool_call_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * GRIDA-SEC-004 — apply a supervised-approval answer (RFC `permission modes`,
 * Phase 2). On resume the client sends the Allow/Deny as an explicit
 * `approval_answer` body field (parsed by {@link coerceApprovalAnswer}), NOT as
 * a mutated assistant message — the server owns message state, so the answer
 * never has to be SDK-part-shaped on the wire. This routes it through
 * `store.answerApproval`, which flips the persisted part to `approval-responded`
 * ONLY if it was a real pending approval with a matching id + session. A forged
 * answer (unknown call, wrong id, already answered) is a silent no-op: the
 * client can only answer what the server already asked.
 */
export async function applyApprovalAnswer(
  store: SessionsStore,
  sessionId: string,
  answer: ApprovalAnswer
): Promise<void> {
  // Pass the answer straight through — `ApprovalAnswer` IS the `answerApproval`
  // param shape. A field-by-field rebuild here would silently drop any field
  // later added to `ApprovalAnswer`; relaying the object keeps the two in lock-step.
  await store.answerApproval(sessionId, answer);
}

/** Narrow an untrusted body value to an {@link ApprovalAnswer}, or `undefined`
 *  (malformed ⇒ no resume). Shape-only — `store.answerApproval` is the
 *  authority on whether the answer matches a real pending approval. */
function coerceApprovalAnswer(raw: unknown): ApprovalAnswer | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (
    typeof a.tool_call_id !== "string" ||
    typeof a.approval_id !== "string" ||
    typeof a.approved !== "boolean"
  ) {
    return undefined;
  }
  return {
    tool_call_id: a.tool_call_id,
    approval_id: a.approval_id,
    approved: a.approved,
    reason: typeof a.reason === "string" ? a.reason : undefined,
  };
}

function normalizeWireMessages(raw: unknown): NormalizedMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: NormalizedMessage[] = [];
  for (const m of raw) {
    if (typeof m !== "object" || m === null) return null;
    const obj = m as Record<string, unknown>;
    const role = obj.role;
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) return null;
    if (Array.isArray(obj.parts)) {
      const parts = normalizeWireParts(obj.parts);
      if (parts === null) return null;
      out.push({
        id: typeof obj.id === "string" ? obj.id : crypto.randomUUID(),
        role: role as NormalizedMessage["role"],
        parts,
      });
      continue;
    }
    if (typeof obj.content === "string") {
      const text = obj.content;
      out.push({
        id: typeof obj.id === "string" ? obj.id : crypto.randomUUID(),
        role: role as NormalizedMessage["role"],
        parts: text.length === 0 ? [] : [{ type: "text", text }],
      });
      continue;
    }
    return null;
  }
  return out;
}

function normalizeWireParts(raw: unknown[]): AgentRunMessagePart[] | null {
  const out: AgentRunMessagePart[] = [];
  for (const part of raw) {
    if (typeof part !== "object" || part === null || Array.isArray(part)) {
      return null;
    }
    const obj = part as Record<string, unknown>;
    if (typeof obj.type !== "string" || obj.type.length === 0) return null;
    if (obj.type === "text" && typeof obj.text !== "string") return null;
    // Reject oversized inline (data:) image attachments BEFORE they are
    // persisted or sent upstream. Defense-in-depth against a buggy/abusive
    // client; the renderer downscales to a smaller target, so a normal send
    // never trips this. Hosted-URL attachments are not size-checked here.
    //
    // Fail closed: detect `data:` case-insensitively, and treat a malformed /
    // non-base64 payload (size === null) as oversized — never let an
    // indeterminate-size inline URL through the backstop.
    if (obj.type === "file" && typeof obj.url === "string") {
      const isDataUrl = obj.url.slice(0, 5).toLowerCase() === "data:";
      if (isDataUrl) {
        const decodedBytes = dataUrlDecodedBytes(obj.url);
        if (decodedBytes === null || decodedBytes > MAX_INLINE_FILE_BYTES) {
          return null;
        }
      }
    }
    out.push({ ...obj, type: obj.type });
  }
  return out;
}

/**
 * Hard ceiling on a single inline image attachment, measured on decoded bytes.
 * Set above the renderer's downscale target (~5 MB) so legitimate sends never
 * trip it — this is the abuse/footgun backstop, enforced before persistence.
 */
const MAX_INLINE_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Decoded byte size of a base64 `data:` URL payload (≈ len*3/4 − padding).
 * Returns `null` for a malformed URL (no comma) or a non-base64 payload, where
 * the base64 byte math doesn't apply — callers must treat `null` as "reject"
 * rather than "size 0", so an indeterminate-size URL can't slip the backstop.
 */
function dataUrlDecodedBytes(dataUrl: string): number | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma).toLowerCase();
  if (!meta.startsWith("data:") || !meta.includes(";base64")) return null;
  const b64 = dataUrl.slice(comma + 1);
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function coerceSkills(raw: unknown): SkillId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SkillId[] = [];
  for (const s of raw) {
    if (typeof s === "string" && ALLOWED_SKILL_IDS.has(s)) {
      out.push(s as SkillId);
    }
  }
  return out;
}
