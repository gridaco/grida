/**
 * `@/lib/agent-chat` — headless brain for any generic agent chat
 * surface in the editor.
 *
 * Owns the Desktop bridge `ChatTransport`, session lifecycle, and the
 * shared message/tool types. Does NOT own any view — the render-only
 * renderer + its `toolDisplay` formatting live in `@/kits/agent-chat`;
 * the standalone-doc sidebar and the workspace pane each write their
 * own layout around it.
 *
 * Per /sdk-design: shared code only when the abstraction is honest.
 * Views diverge; this module is what genuinely doesn't.
 */

export type { ChatMessage, ToolCallEntry } from "./types";
export {
  buildApprovalResumeBody,
  type ApprovalResumeBody,
  type ApprovalResumeArgs,
} from "./approval-resume";
export {
  desktopAgentTransport,
  type DesktopAgentTransportOptions,
} from "./bridge-transport";
export {
  useChatSession,
  type UseChatSessionFilter,
  type UseChatSessionResult,
} from "./use-chat-session";
export {
  useRefreshOnStreamEnd,
  type ChatStreamStatus,
} from "./use-refresh-on-stream-end";
export { useSessionFork, type UseSessionFork } from "./use-session-fork";
export {
  useQueuedMessages,
  queuedMessageText,
  type UseQueuedMessagesResult,
} from "./use-queued-messages";
export {
  isSessionBusy,
  decideSubmit,
  type TurnQueueStatus,
} from "./turn-queue";
export {
  useTurnQueueController,
  type UseTurnQueueControllerArgs,
  type UseTurnQueueControllerResult,
} from "./use-turn-queue-controller";
export {
  useSessionStatus,
  useCoreTurnSync,
  type CoreRunState,
} from "./use-session-status";
export {
  StreamAttachOwner,
  type StreamAttachBinding,
  type StreamAttachDecision,
  type StreamAttachDenyReason,
  type StreamAttachIntent,
  type StreamAttachPhase,
} from "./stream-attach-owner";
export { useStreamAttach, type UseStreamAttachArgs } from "./use-stream-attach";
export { chatError } from "./chat-error";
export {
  computeContextUsage,
  estimateContextBreakdown,
  estimateTokens,
  lastAssistantUsage,
  usageTokenTotal,
  type ContextBreakdown,
  type ContextUsage,
  type MessageUsage,
} from "./context-usage";
export {
  IMAGE_ATTACHMENT_POLICY,
  isSupportedImageType,
  planResize,
  decodedBytes,
  toFileUiParts,
  encodeImageFile,
  type ImageAttachmentPolicy,
  type EncodedImageAttachment,
} from "./image-attachment";
export {
  buildAgentSend,
  buildTemplateContext,
  type AgentSendBody,
  type ContextPart,
  type TemplateContextMeta,
} from "./build-agent-send";
