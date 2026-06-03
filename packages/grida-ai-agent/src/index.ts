// Curated client-safe root surface — explicit named re-exports only, no
// star. Anything not listed here is internal; promote on dogfooding.

// Outward protocol — provider identity, handshake, run options, wire vocab.
export {
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  type ByokProviderMetadata,
  type ByokProviderId,
} from "./protocol/provider-ids";
export {
  AGENT_SERVER_PROTOCOL,
  AGENT_SERVER_DEFAULT_CAPABILITIES,
  type AgentServerCapabilities,
  type AgentServerHandshakeResponse,
} from "./protocol/handshake";
export {
  AGENT_SESSION_AGENT,
  type AgentModelId,
  type AgentRunMessage,
  type AgentRunMessagePart,
  type AgentRunOptions,
} from "./protocol/run";
export { AGENT_SKILL_IDS, type SkillId } from "./protocol/skills";
export {
  GRIDA_STATUS_SSE_EVENT,
  type SessionRunState,
  type SessionStatus,
} from "./protocol/session-status";
export type { AgentUIMessageChunk } from "./protocol/wire";
export type {
  FileRegisterResult,
  FileReadResult,
  FileWriteResult,
  RecentEntry,
  Workspace,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "./protocol/resources";

// Session-layer row contract (the persisted chat-history shapes).
export type {
  ChatModel,
  ChatSessionRow,
  ChatMessageRow,
  ChatPartRow,
  ChatMessageWithParts,
  MessageUsage,
  PermissionRule,
  ForkSessionOptions,
  RewindResult,
  SessionListFilter,
  SessionListPage,
  CreateSessionOptions,
  PatchSessionOptions,
} from "./session/rows";

// Grida agent surface — runtime-agnostic factory, types, prompt
// composition, tool registry, tier constants, tool-name vocab.
export {
  createAgent,
  type Agent,
  type AgentCallOptions,
  type AgentMessage,
  type CreateAgentOptions,
  type ModelFactory,
  type RunCommandBackend,
} from "./agent";
export { composeSystemPrompt } from "./agent/prompts";
export {
  createToolset,
  RUN_COMMAND_TOOL_NAME,
  type AgentToolName,
  type RunCommandOutcome,
  type ToolsetCapabilities,
} from "./tools";
export { AGENT_DEFAULT_TIER, AGENT_TIERS, type ModelTier } from "./tiers";
