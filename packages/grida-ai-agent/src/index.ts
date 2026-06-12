// Curated client-safe root surface — explicit named re-exports only, no
// star. Anything not listed here is internal; promote on dogfooding.

// Outward protocol — provider identity, handshake, run options, wire vocab.
export {
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  isByokProviderId,
  type ByokProviderMetadata,
  type ByokProviderId,
  type ProviderId,
} from "./protocol/provider-ids";
export {
  OLLAMA_ENDPOINT_PRESET,
  isValidEndpointProviderId,
  mergeProbedModels,
  resolveEndpointModel,
  resolveEndpointModels,
  validateEndpointProviderConfig,
  type EndpointModelEntry,
  type EndpointModelOverrides,
  type EndpointModelSpec,
  type EndpointProviderConfig,
  type ProbedEndpointModel,
  type ProbeMergeResult,
} from "./protocol/endpoints";
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
  AGENT_MODES,
  AGENT_DEFAULT_MODE,
  asAgentMode,
  type AgentMode,
} from "./protocol/mode";
export {
  GRIDA_STATUS_SSE_EVENT,
  type SessionRunState,
  type SessionStatus,
} from "./protocol/session-status";
export {
  GRIDA_EVENTS_SSE_EVENT,
  type AgentApprovalRequestedEvent,
  type AgentLifecycleEvent,
  type AgentTurnEndReason,
  type AgentTurnFinishedEvent,
  type AgentTurnStartedEvent,
} from "./protocol/events";
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
