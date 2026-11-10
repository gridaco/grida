// GRIDA-SEC-004 — renderer-safe native chat projection.
import type {
  NativeEditorSurfaceOpen,
  NativeEditorSurfaceSnapshot,
} from "./native-editor-surfaces";
import type { NativeSubagentClient } from "./native-subagents";

export type NativeChatAttachment = Readonly<{
  attachmentId: string;
  sessionId: string;
}>;

export type NativeChatOperatingRegime = "act" | "plan";

export type NativeChatCommand = "compact" | "fork";
export type NativeChatCommandResult =
  | Readonly<{ command: "fork"; sessionId: string }>
  | Readonly<{
      command: "compact";
      turnId: string | null;
      status:
        | "running"
        | "suspended"
        | "interrupted"
        | "installed"
        | "stale"
        | "failed"
        | "stopped"
        | "uncertain"
        | "no_change";
    }>;

export type NativeChatImageInput = Readonly<{
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
  png: ArrayBuffer;
  operatingRegime: NativeChatOperatingRegime;
}>;

export type NativeContextLimit = Readonly<{
  reviewId: string;
  limit: number | null;
  exactCounting: boolean;
  source: "active" | "pending" | "invalid";
}>;

export type NativeContextLimitResult = Readonly<{
  limit: number | null;
  disposition: "applied" | "observed";
}>;

export type NativeChatConfigurationInput = Readonly<{
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
}>;

export type NativeChatPage = Readonly<{
  sessionIds: readonly string[];
  titles?: readonly Readonly<{ sessionId: string; title: string }>[];
  nextCursor: string | null;
}>;

export type NativeChatCatalogEntry = Readonly<{
  sessionId: string;
  revision: number;
  title: string | null;
  archived: boolean;
  deletionAvailable?: true;
}>;

export type NativeChatCatalogChange = Pick<
  NativeChatCatalogEntry,
  "revision" | "title" | "archived"
>;

export type NativeChatSideContext = Readonly<{
  sourceRevision: number;
  compacted: boolean;
  truncated: boolean;
  omitted: boolean;
}>;

export type NativeChatSideAnswer = Readonly<{
  turnId: string;
  status: "succeeded" | "failed" | "cancelled" | "uncertain";
  text: string;
  textTruncated: boolean;
}>;

export type NativeChatReadiness =
  | "legacy"
  | "native-starting"
  | "native-ready"
  | "native-unavailable";

export type NativeChatTurn = Readonly<{
  turnId: string;
  epoch: number;
  journalPosition: number;
  historyPosition: number;
  controlRevision: number;
  paused: boolean;
  cancelled: boolean;
  disposition: "running" | "suspended" | "interrupted" | "settled";
  status: "succeeded" | "failed" | "cancelled" | "uncertain" | null;
}>;

export type NativeChatSnapshot = Readonly<{
  sessionId: string;
  sessionRevision: number;
  queuedInputs: number;
  pendingGoalId?: string;
  historyRevisionAvailable?: true;
  subagentsAvailable?: true;
  /** Earliest provider retry time in UTC milliseconds for the current turn. */
  retryNotBeforeMs?: number;
  admissionPaused: boolean;
  current: NativeChatTurn | null;
  latest: NativeChatTurn | null;
}>;

export type NativeChatObservation = Readonly<{
  observationId: string;
  snapshot: NativeChatSnapshot;
}>;

export type NativeChatRevisionTarget = Readonly<{
  reviewId: string;
  messageId: string;
  text: string;
  subsequentMessages: number;
}>;

export type NativeChatRevisionInput = Readonly<{
  reviewId: string;
  text: string;
  operatingRegime: NativeChatOperatingRegime;
}>;

export type NativeChatRevisionReceipt = Readonly<{
  sessionId: string;
  view: number;
  inputId: string;
  inputPosition: number;
}>;

export type NativeChatWakeup = Readonly<{
  turnId: string;
  waitId: string;
  dueAtMs: number;
  reason: string;
  status: "waiting" | "paused" | "delivered" | "cancelled" | "stopped";
  armed: boolean;
}>;

export type NativeChatWakeupAction = "cancel" | "recover";

export type NativeChatImageArtifact = Readonly<{
  id: string;
  kind: "image";
  mimeType: "image/png";
  label: "Cropped PNG";
  width: number;
  height: number;
  bytes: number;
}>;

export type NativeChatArtifactSaveResult = "saved" | "cancelled" | "failed";

export type NativeChatTokenCategory =
  | "input"
  | "output"
  | "uncached_input"
  | "cached_input"
  | "cache_creation_input"
  | "tool_input"
  | "reasoning_output";

export type NativeChatTokenUsage = Readonly<{
  reported: readonly Readonly<{
    category: NativeChatTokenCategory;
    /** Exact decimal subtotal from the reported attempts. */
    tokens: string;
    partial: boolean;
  }>[];
  attemptsWithoutCounts: number;
}>;

export type NativeChatTurnSummary = Readonly<{
  turnId: string;
  status: NonNullable<NativeChatTurn["status"]>;
  text: string;
  textTruncated: boolean;
  steps: number | null;
  unresolvedOperations: number | null;
  toolActivity: Readonly<{
    succeeded: number;
    failed: number;
    cancelled: number;
    unresolved: number;
  }> | null;
  checks: readonly (
    | "allowed"
    | "denied"
    | "failed"
    | "cancelled"
    | "uncertain"
    | "invalid_reply"
    | "unavailable"
    | "deferred"
    | "skipped"
  )[];
  tokenUsage?: NativeChatTokenUsage;
  artifacts?: readonly NativeChatImageArtifact[];
}>;

export type NativeChatMessage = Readonly<{
  messageId: string;
  role: "user" | "assistant";
  text: string;
}>;

export type NativeChatAcceptance = Readonly<{
  sessionId: string;
  inputId: string;
  inputPosition: number;
  turnId: string | null;
  disposition: "queued" | "claimed" | "completed" | "superseded" | "withdrawn";
  replacementInputId?: string;
}>;

export type NativeChatControl = Readonly<{
  action: "pause" | "stop" | "resume";
  observationId: string;
  requestId: string;
  cancelledWakeupId?: string;
}>;

export type NativeChatQueueItem = Readonly<{
  inputId: string;
  preview: string | null;
  goalStart?: NativeChatGoalRequest;
  operatingRegime?: NativeChatOperatingRegime;
  allowsConfigurationChange?: true;
}>;

export type NativeChatQueuePage = Readonly<{
  items: readonly NativeChatQueueItem[];
  offset: number;
  previousOffset: number | null;
  nextOffset: number | null;
}>;

export type NativeChatQueueAction =
  | { action: "replace"; inputId: string; text: string }
  | { action: "withdraw"; inputId: string }
  | { action: "move"; inputId: string; direction: "up" | "down" }
  | { action: "resume" };

export type NativeChatQueueChange = NativeChatQueueAction & {
  observationId: string;
  requestId: string;
};

export type NativeChatQueueReceipt = Readonly<{
  sessionId: string;
  requestId: string;
  sessionRevision: number;
}>;

export type NativeChatSteer = Readonly<{
  observationId: string;
  requestId: string;
  text: string;
}>;

export type NativeChatGoalUsage = Readonly<{
  workTurns: number;
  inferenceSteps: number;
}>;

export type NativeChatGoalRequest = Readonly<{
  objective: string;
  criteria: readonly string[];
  allowance: NativeChatGoalUsage;
  automatic: boolean;
}>;

export type NativeChatGoalStatus =
  | { status: "active" | "complete" | "exhausted" | "cleared" }
  | {
      status: "blocked";
      reason:
        | "needs_input"
        | "capability_unavailable"
        | "no_progress"
        | "unverified_completion"
        | "uncertain_work";
    };

export type NativeChatGoal = Readonly<
  NativeChatGoalRequest & {
    goalId: string;
    state: NativeChatGoalStatus;
    paused: boolean;
    progress: string | null;
    spent: NativeChatGoalUsage;
    remaining: NativeChatGoalUsage;
    reservation: Readonly<{
      turnId: string;
      inferenceSteps: number;
      uncertain: boolean;
    }> | null;
  }
>;

export type NativeChatGoalObservation = Readonly<{
  observationId: string | null;
  goal: NativeChatGoal | null;
}>;

export type NativeChatGoalAction = "pause" | "resume" | "clear";

export type NativeChatGoalControl = Readonly<{
  observationId: string;
  requestId: string;
  action: NativeChatGoalAction;
}>;

export type NativeChatGoalReceipt = Readonly<{
  sessionId: string;
  requestId: string;
  sessionRevision: number;
  stateRevision: number;
  turnId: string | null;
  journalPosition: number | null;
}>;

export type NativeChatControlReceipt = Readonly<{
  sessionId: string;
  turnId: string;
  requestId: string;
  sessionRevision: number;
  journalPosition: number;
}>;

export type NativeChatApproval = Readonly<{
  reviewId: string;
  tool: "read_file" | "list_files" | "search_text";
  root: string;
  relativePath: string;
  query?: string;
}>;

export type NativeChatApprovalDecision = "approve_once" | "decline";

export type NativeChatQuestion = Readonly<{
  questionId: string;
  reviewId: string;
  style: "answer_dependent" | "nonblocking";
  question: string;
  options: readonly string[];
}>;

export type NativeChatQuestionAnswer =
  | { kind: "choice"; index: number }
  | { kind: "text"; text: string }
  | { kind: "skipped" };

export type NativeChatControlResult =
  | { action: "pause" | "stop"; receipt: NativeChatControlReceipt }
  | { action: "resume"; turn: NativeChatTurn };

export type NativeChatTextUpdate = Readonly<{
  kind: "text";
  role: "user" | "assistant";
  messageId: string;
  text: string;
  turnId: string;
  offsetBytes: number;
  replace: boolean;
}>;

export type NativeChatStreamUpdate =
  | NativeChatTextUpdate
  | Readonly<{ kind: "resync" }>;

export type NativeChatUpdate =
  | NativeChatStreamUpdate
  | Readonly<{
      kind: "closed";
      reason: "delivery_limit" | "session_deleted";
    }>;

/** Available only for a main-selected native chat in the current workspace. */
export type DesktopNativeChat = Partial<NativeSubagentClient> & {
  available(): Promise<boolean>;
  /** Starts the admitted workspace when requested and native mode is selected. */
  status?(start?: boolean): Promise<NativeChatReadiness>;
  list(cursor?: string | null): Promise<NativeChatPage>;
  listArchived?(cursor?: string | null): Promise<NativeChatPage>;
  catalogEntry?(attachmentId: string): Promise<NativeChatCatalogEntry>;
  organize?(
    attachmentId: string,
    change: NativeChatCatalogChange
  ): Promise<NativeChatCatalogEntry>;
  deleteSavedChat?(
    attachmentId: string,
    observationId: string,
    catalogRevision: number
  ): Promise<boolean>;
  create(): Promise<NativeChatAttachment>;
  commands?(attachmentId: string): Promise<readonly NativeChatCommand[]>;
  runCommand?(
    attachmentId: string,
    command: NativeChatCommand,
    requestId: string
  ): Promise<NativeChatCommandResult>;
  prepareRevision?(
    attachmentId: string,
    observationId: string,
    messageId: string
  ): Promise<NativeChatRevisionTarget>;
  revise?(
    attachmentId: string,
    input: NativeChatRevisionInput
  ): Promise<NativeChatRevisionReceipt>;
  load(sessionId: string): Promise<NativeChatAttachment>;
  openSideChat?(
    attachmentId: string,
    openId: string
  ): Promise<NativeChatSideContext>;
  askSideChat?(
    attachmentId: string,
    openId: string,
    requestId: string,
    text: string
  ): Promise<NativeChatSideAnswer>;
  closeSideChat?(attachmentId: string, openId: string): Promise<void>;
  detach(attachmentId: string): Promise<void>;
  publishEditorSurfaces?(
    attachmentId: string,
    snapshot: NativeEditorSurfaceSnapshot,
    presentationRevision?: number
  ): Promise<void>;
  onEditorSurfaceOpen?(
    attachmentId: string,
    open: (request: NativeEditorSurfaceOpen, isCurrent: () => boolean) => void
  ): () => void;
  submit(
    attachmentId: string,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance>;
  enqueue?(
    attachmentId: string,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance>;
  submitInRegime?(
    action: "submit" | "enqueue",
    attachmentId: string,
    inputId: string,
    text: string,
    operatingRegime: NativeChatOperatingRegime
  ): Promise<NativeChatAcceptance>;
  acceptsPng?(): Promise<boolean>;
  acceptsWakeups?(): Promise<boolean>;
  submitWithWakeup?(
    attachmentId: string,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance>;
  scheduledWakeup?(
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatWakeup | null>;
  controlWakeup?(
    attachmentId: string,
    observationId: string,
    waitId: string,
    action: NativeChatWakeupAction
  ): Promise<NativeChatWakeup>;
  submitImage?(
    attachmentId: string,
    input: NativeChatImageInput
  ): Promise<NativeChatAcceptance>;
  contextLimit?(): Promise<NativeContextLimit>;
  saveContextLimit?(
    reviewId: string,
    limit: number | null
  ): Promise<NativeContextLimitResult>;
  submitWithConfigurationReview?(
    attachmentId: string,
    input: NativeChatConfigurationInput
  ): Promise<NativeChatAcceptance>;
  inputReceipt(
    attachmentId: string,
    inputId: string
  ): Promise<NativeChatAcceptance>;
  observe(attachmentId: string): Promise<NativeChatObservation>;
  turnSummary?(
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatTurnSummary>;
  readArtifact?(
    attachmentId: string,
    observationId: string,
    artifactId: string
  ): Promise<ArrayBuffer>;
  saveArtifact?(
    attachmentId: string,
    observationId: string,
    artifactId: string
  ): Promise<NativeChatArtifactSaveResult>;
  queue?(
    attachmentId: string,
    observationId: string,
    offset: number
  ): Promise<NativeChatQueuePage>;
  queuedText?(
    attachmentId: string,
    observationId: string,
    inputId: string
  ): Promise<string>;
  editQueue?(
    attachmentId: string,
    change: NativeChatQueueChange
  ): Promise<NativeChatQueueReceipt>;
  steer?(
    attachmentId: string,
    input: NativeChatSteer
  ): Promise<NativeChatControlReceipt>;
  goal?(
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatGoalObservation>;
  startGoal?(
    attachmentId: string,
    inputId: string,
    request: NativeChatGoalRequest
  ): Promise<NativeChatAcceptance>;
  controlGoal?(
    attachmentId: string,
    change: NativeChatGoalControl
  ): Promise<NativeChatGoalReceipt>;
  approvals?(
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatApproval[]>;
  answerApproval?(
    attachmentId: string,
    reviewId: string,
    decision: NativeChatApprovalDecision
  ): Promise<NativeChatControlReceipt>;
  questions?(
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatQuestion[]>;
  answerQuestion?(
    attachmentId: string,
    reviewId: string,
    answer: NativeChatQuestionAnswer
  ): Promise<NativeChatControlReceipt>;
  transcript(attachmentId: string): Promise<readonly NativeChatMessage[]>;
  control(
    attachmentId: string,
    control: NativeChatControl
  ): Promise<NativeChatControlResult>;
  subscribe(
    attachmentId: string,
    update: (update: NativeChatUpdate) => void
  ): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
};
