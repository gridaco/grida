/**
 * Agent run request boundary.
 *
 * Converts the loose HTTP body into the internal run request shape.
 * Runtime orchestration receives a typed request and does not own
 * catalog/provider/workspace validation details.
 */

import crypto from "node:crypto";
import { models } from "@grida/ai-models";
import type { AgentModelId, AgentRunMessagePart } from "../protocol/run";
import { AGENT_SKILL_IDS, type SkillId } from "../protocol/skills";
import { AGENT_DEFAULT_TIER, AGENT_TIERS, type ModelTier } from "../tiers";
import {
  BYOK_PROVIDER_IDS,
  type ByokProviderId,
} from "../protocol/provider-ids";
import type { SessionsStore } from "../session/store";
import type { WorkspaceRegistry } from "../workspaces";

const ALLOWED_PROVIDER_IDS = new Set<string>(BYOK_PROVIDER_IDS);
const ALLOWED_TIERS = new Set<string>(AGENT_TIERS);
const ALLOWED_MODEL_IDS = new Set<string>(Object.keys(models.text.catalog));
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
  /** Explicit catalog model id; overrides the tier→model mapping. */
  model_id?: AgentModelId;
  explicit?: ByokProviderId;
  feature?: string;
  workspace_id?: string;
  workspace_root?: string;
  skills?: SkillId[];
  session_id?: string;
};

export type ParseRunBodyDeps = {
  workspace_registry: WorkspaceRegistry;
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
    if (typeof b.model_id !== "string" || !ALLOWED_MODEL_IDS.has(b.model_id)) {
      return Response.json(
        { error: `modelId not allowed: ${String(b.model_id)}` },
        { status: 400 }
      );
    }
    modelId = b.model_id as AgentModelId;
  }
  let explicit: ByokProviderId | undefined;
  if (b.provider_id !== undefined) {
    if (
      typeof b.provider_id !== "string" ||
      !ALLOWED_PROVIDER_IDS.has(b.provider_id)
    ) {
      return Response.json(
        { error: `providerId not allowed: ${String(b.provider_id)}` },
        { status: 400 }
      );
    }
    explicit = b.provider_id as ByokProviderId;
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
    session_id:
      typeof b.session_id === "string" && b.session_id.length > 0
        ? b.session_id
        : undefined,
  };
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
    if (m.role === "assistant") continue;
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
    out.push({ ...obj, type: obj.type });
  }
  return out;
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
