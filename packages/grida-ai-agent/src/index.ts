// Curated client-safe root surface — explicit named re-exports only, no
// star. Anything not listed here is internal; promote on dogfooding.
// GRIDA-SEC-008 — neutral ChatGPT wire facts expose no credential implementation.

// Provider identity, ChatGPT subscription status, GG session DTOs, endpoint
// configuration and media request/result shapes.
export {
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  byokProvidersFor,
  GG_PROVIDER_ID,
  GG_PROVIDER_METADATA,
  CHATGPT_PROVIDER_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  CHATGPT_SUBSCRIPTION_MODEL_METADATA,
  isChatGptSubscriptionModelId,
  type ByokProviderId,
  type ByokProviderMetadata,
  type ProviderId,
} from "./protocol/provider-ids";
export type {
  ChatGptAuthStart,
  ChatGptSubscriptionAccount,
  ChatGptSubscriptionModelId,
  ChatGptSubscriptionStatus,
} from "./protocol/chatgpt";
// GRIDA-SEC-006 — hosted-session wire shapes (types only; the store is
// internal daemon state).
// GRIDA-GG: provider — neutral status and session DTOs, no credential store.
export type {
  GridaGatewaySession,
  GridaGatewaySessionStatus,
} from "./providers/gg-session";
export type {
  ImageGenerateRequest,
  ImageGenerateResult,
} from "./protocol/images";
export type {
  VideoGenerateRequest,
  VideoGenerateResult,
} from "./protocol/video";
export type {
  ThreeDInputImage,
  ThreeDGenerateRequest,
  ThreeDGenerateResult,
} from "./protocol/three-d";
export type {
  ModelGenerationGenerateRequest,
  ModelGenerationGenerateResult,
} from "./protocol/model-generation";
export type {
  RigCheckRequest,
  RigCheckResult,
  RiggingGenerateRequest,
  RiggingGenerateResult,
} from "./protocol/rigging";

export type {
  MusicGenerateRequest,
  MusicGenerateResult,
} from "./protocol/music";
export type {
  SoundEffectGenerateRequest,
  SoundEffectGenerateResult,
} from "./protocol/sound-effects";
export type {
  TextToSpeechGenerateRequest,
  TextToSpeechGenerateResult,
  TextToSpeechListVoicesResult,
  TextToSpeechVoice,
} from "./protocol/text-to-speech";
export {
  OLLAMA_ENDPOINT_PRESET,
  allowsLlamaCppInputCounting,
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
} from "./protocol/endpoints";
// Earlier chat client contract (run options, context parts, modes, session
// rows and status). Only the renderer's earlier chat pane consumes these; they
// leave with that pane.
export {
  AGENT_SESSION_AGENT,
  SCRATCH_SEED_LIMITS,
  type AgentRunOptions,
  type ScratchSeedEntry,
} from "./protocol/run";
export { normalizeSdkToolPartFields } from "./protocol/tool-part-fields";
export {
  DIRECTORY_SCOPE_MOUNT_ROOT,
  USER_TEMPLATE_SELECTION,
  USER_FILE_ATTACHMENTS,
  USER_DIRECTORY_REFERENCES,
  type DirectoryScopeDescriptor,
  type UserFileAttachmentsData,
} from "./protocol/context";
export {
  AGENT_MODES,
  AGENT_DEFAULT_MODE,
  asAgentMode,
  type AgentMode,
} from "./protocol/mode";
export type { SessionRunState, SessionStatus } from "./protocol/session-status";
export type { AgentUIMessageChunk } from "./protocol/wire";
export type {
  ChatSessionRow,
  ChatMessageWithParts,
  RewindResult,
  SessionListFilter,
  SessionListPage,
  CreateSessionOptions,
  PatchSessionOptions,
} from "./session/rows";

export { AGENT_TIERS } from "./tiers";

export type { GGModelsView } from "./protocol/gg-models";
