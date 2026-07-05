// Curated client-safe root surface — explicit named re-exports only, no
// star. Anything not listed here is internal; promote on dogfooding.

// Outward protocol — provider identity, handshake, run options, wire vocab.
export {
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  byokProvidersFor,
  isByokProviderId,
  GG_PROVIDER_ID,
  GG_PROVIDER_METADATA,
  isGgProviderId,
  type ByokModality,
  type ByokProviderMetadata,
  type ByokProviderId,
  type ProviderId,
} from "./protocol/provider-ids";
// GRIDA-SEC-006 — hosted-session wire shapes (types only; the store is
// internal daemon state).
export type {
  GridaGatewaySession,
  GridaGatewaySessionStatus,
  GridaGatewayOrganization,
} from "./providers/gg-session";
export type {
  ImageGenProvider,
  ImageGenerateRequest,
  ImageGeneratedImage,
  ImageGenerateResult,
} from "./protocol/images";
export type {
  VideoGenProvider,
  VideoGenerateRequest,
  GeneratedVideo,
  VideoGenerateResult,
} from "./protocol/video";
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
  AGENT_SESSION_AGENT,
  type AgentModelId,
  type AgentRunMessage,
  type AgentRunMessagePart,
  type AgentRunOptions,
} from "./protocol/run";
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
// Daemon handshake + local-resource DTOs moved to `@grida/daemon` (#927) —
// import them from there.

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
  QUESTION_TOOL_NAME,
  type AgentToolName,
  type RunCommandOutcome,
  type ToolsetCapabilities,
} from "./tools";
export { AGENT_DEFAULT_TIER, AGENT_TIERS, type ModelTier } from "./tiers";
