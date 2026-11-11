// GRIDA-SEC-004 — renderer-safe native chat projection.
import type {
  NativeEditorSurfaceOpen,
  NativeEditorSurfaceSnapshot,
} from "./native-editor-surfaces";
import type { NativeEditorSvgText } from "./native-editor-svg-text";
import type { NativeSubagentClient } from "./native-subagents";

export type NativeChatAttachment = Readonly<{
  attachmentId: string;
  sessionId: string;
}>;

export type NativeChatOperatingRegime = "act" | "plan";
export type NativeChatEffort = "standard" | "ultra";

export type NativeHookEvent =
  | "session_start"
  | "before_input"
  | "before_tool"
  | "after_tool"
  | "before_completion";

export type NativeHookInfo = Readonly<{
  id: string;
  source: string;
  event: NativeHookEvent;
  tool?: string | null;
  enabled: boolean;
  mode: "required" | "observe";
  executable: string;
  arguments: readonly string[];
  timeoutMs: number;
  revision: string;
}>;

export type NativeHookResult = Readonly<{
  id: string;
  revision: string;
  event: NativeHookEvent;
  operation: string | null;
  status:
    | "allowed"
    | "denied"
    | "failed"
    | "cancelled"
    | "uncertain"
    | "invalid_reply"
    | "unavailable"
    | "deferred"
    | "skipped";
  reason?: string | null;
}>;

export type NativeHookInspection = Readonly<{
  supportedEvents: readonly NativeHookEvent[];
  active: readonly NativeHookInfo[];
  saved: readonly NativeHookInfo[];
  activation: "current" | "restart_required";
  results?: readonly NativeHookResult[];
}>;

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
  effort?: NativeChatEffort;
}>;

export type NativeChatFileInput = Readonly<{
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
  name: string;
  bytes: ArrayBuffer;
  operatingRegime: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
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
  effort?: NativeChatEffort;
}>;

export type NativeChatPage = Readonly<{
  sessionIds: readonly string[];
  titles?: readonly Readonly<{ sessionId: string; title: string }>[];
  nextCursor: string | null;
}>;

export type NativeChatProfileChoice = Readonly<{
  id: string;
  connection: string;
  model: string;
}>;

export type NativeChatProfileCatalog = Readonly<{
  active: string | null;
  choices: readonly NativeChatProfileChoice[];
  saved: readonly (NativeChatProfileChoice & { available: boolean })[];
}>;

export type NativeChatProfileSelection =
  | Readonly<{ kind: "default" }>
  | Readonly<{ kind: "new" | "saved"; id: string }>;

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
  | "native-unavailable"
  | "native-gateway-unavailable"
  | "native-provider-key-required"
  | "native-provider-model-unavailable"
  | "native-provider-endpoint-https-required"
  | "native-provider-endpoint-approval-required";

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
  goalNamedChildAvailable?: true;
  goalSpendingAvailable?: true;
  goalManualContinuationAvailable?: true;
  /** Earliest provider retry time in UTC milliseconds for the current turn. */
  retryNotBeforeMs?: number;
  admissionPaused: boolean;
  /** Main accepts an explicit Resume for this idle, unpaused queue. */
  idleQueueResumeAvailable?: true;
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
  effort?: "ultra";
}>;

export type NativeChatRevisionInput = Readonly<{
  reviewId: string;
  text: string;
  operatingRegime: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
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

export type NativeChatGatewayChildRef = Readonly<{
  childId: string;
  inputId: string;
}>;

export type NativeChatGatewayAttemptRef = Readonly<{
  operationId: string;
  attemptId: string;
  child?: NativeChatGatewayChildRef;
}>;

export type NativeChatGatewayBillingAttempt = Omit<
  NativeChatGatewayAttemptRef,
  "child"
> &
  Readonly<
    | { kind: "settled"; chargedMills: string; refreshable: false }
    | { kind: "pending" | "unavailable"; refreshable: boolean }
  >;

export type NativeChatGatewayBillingAttempts = Readonly<{
  attempts: readonly NativeChatGatewayBillingAttempt[];
  omittedAttempts: number;
}>;

export type NativeChatGatewayChildBilling = NativeChatGatewayChildRef &
  Readonly<{
    name: string;
    disposition: Readonly<
      | { kind: "queued" | "withdrawn" }
      | { kind: "claimed" | "completed"; turn: string }
      | { kind: "superseded"; replacement: string }
    >;
    billing?: NativeChatGatewayBillingAttempts;
  }>;

export type NativeChatGatewayChildBillingPage = Readonly<{
  assignments: readonly NativeChatGatewayChildBilling[];
  nextAfter?: NativeChatGatewayChildRef;
  coverageIncomplete: boolean;
}>;

export type NativeChatGatewayBilling = NativeChatGatewayBillingAttempts &
  Readonly<{
    review?: NativeChatGatewayBillingAttempts;
    children?: NativeChatGatewayChildBillingPage;
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
  gatewayBilling?: NativeChatGatewayBilling;
  reviewFindingsCollected?: boolean;
  artifacts?: readonly NativeChatImageArtifact[];
  artifactsOmitted?: number;
}>;

export type NativeChatMessage = Readonly<{
  messageId: string;
  role: "user" | "assistant";
  text: string;
}>;

export type NativeChatTranscriptPage = Readonly<{
  view: number;
  messages: readonly NativeChatMessage[];
  older: string | null;
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
  effort?: "ultra";
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
  operatingRegime?: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  namedChildId?: string;
  allowWakeup?: true;
  /** Exact USD mills under a negotiated provider-enforced allocation. */
  maxCostMills?: string;
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
  Omit<NativeChatGoalRequest, "allowWakeup" | "operatingRegime"> & {
    goalId: string;
    state: NativeChatGoalStatus;
    paused: boolean;
    progress: string | null;
    continuationPending?: true;
    spent: NativeChatGoalUsage;
    remaining: NativeChatGoalUsage;
    spending?: Readonly<{
      maxCostMills: string;
      perRequestMaxCostMills: string;
      chargedMills: string;
      heldMills: string;
      remainingMills: string;
      unsettledAttempts: number;
    }>;
    review?: Readonly<{
      status: "pending" | "confirmed";
      turnId: string;
      summary: string;
    }>;
    reservation: Readonly<{
      turnId: string;
      inferenceSteps: number;
      reviewInferenceSteps?: number;
      uncertain: boolean;
    }> | null;
  }
>;

export type NativeChatGoalObservation = Readonly<{
  observationId: string | null;
  goal: NativeChatGoal | null;
  goalRevision?: number;
}>;

export type NativeChatGoalAction =
  | "pause"
  | "resume"
  | "clear"
  | "confirm_completion"
  | "reconcile_review";

export type NativeChatGoalObjective = Readonly<{
  description: string;
  criteria: readonly string[];
}>;

export type NativeChatGoalChange = Readonly<
  | { action: NativeChatGoalAction }
  | { action: "revise"; objective: NativeChatGoalObjective }
>;

export type NativeChatGoalControl = Readonly<{
  observationId: string;
  requestId: string;
}> &
  NativeChatGoalChange;

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

export type NativeChatLibrarySelection = Readonly<{
  selectionId: string;
  reviewId: string;
  initialSearchQuery: string;
}>;

export type NativeChatLibrarySelectionAnswer =
  | Readonly<{ kind: "selected"; id: string; png: Uint8Array }>
  | Readonly<{ kind: "skipped" }>;

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

export type NativeChatNotificationFocus = Readonly<{
  sessionId: string;
  profileId?: string;
}>;

/** Available for a native chat in the exact scope selected by Main. */
export type DesktopNativeChat = Partial<NativeSubagentClient> & {
  /** This launch cannot provide native chat for an independently opened file. */
  readonly documentUnavailable?: true;
  /** This host also accepts native chat requests from an admitted root deck. */
  readonly deck?: true;
  /** This host also offers native chat for the exact selected nested deck. */
  readonly nestedDeck?: true;
  /** The file window can lend its active slide's live SVG text selection. */
  readonly deckSvgText?: true;
  /** This native package offers chat for the exact selected standalone SVG. */
  readonly document?: true;
  available(): Promise<boolean>;
  /**
   * Starts the admitted workspace when requested and native mode is selected.
   * Setup failures are fixed readiness values. Treat an unrecognized value
   * as unavailable and keep the selected native mode.
   */
  status?(start?: boolean): Promise<NativeChatReadiness>;
  /** Take the latest notification click for this workbench once, if still current. */
  takeNotificationFocus?(): Promise<NativeChatNotificationFocus | null>;
  list(cursor?: string | null): Promise<NativeChatPage>;
  profiles?(): Promise<NativeChatProfileCatalog | null>;
  /** Inspect reviewed definitions and retained results without running handlers. */
  inspectHooks?(attachmentId?: string): Promise<NativeHookInspection>;
  /** Main owns file selection and the explicit review of executable authority. */
  importHook?(): Promise<NativeHookInspection | null>;
  removeHook?(id: string, revision: string): Promise<NativeHookInspection>;
  selectProfile?(selection: NativeChatProfileSelection): Promise<void>;
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
  onEditorSvgText?(
    attachmentId: string,
    invoke: (request: NativeEditorSvgText.Request) => NativeEditorSvgText.Result
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
    operatingRegime: NativeChatOperatingRegime,
    effort?: NativeChatEffort,
    editorSvgTargetId?: string
  ): Promise<NativeChatAcceptance>;
  acceptsEffort?(): Promise<boolean>;
  acceptsGoalEffort?(): Promise<boolean>;
  acceptsPng?(): Promise<boolean>;
  acceptsLibrarySelection?(): Promise<boolean>;
  submitWithLibrarySelection?(
    attachmentId: string,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    effort?: NativeChatEffort
  ): Promise<NativeChatAcceptance>;
  acceptsFile?(): Promise<boolean>;
  acceptsWakeups?(): Promise<boolean>;
  submitWithWakeup?(
    attachmentId: string,
    inputId: string,
    text: string,
    effort?: NativeChatEffort
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
  submitFile?(
    attachmentId: string,
    input: NativeChatFileInput
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
    observationId: string,
    refreshGatewayAttempt?: NativeChatGatewayAttemptRef,
    childBillingAfter?: NativeChatGatewayChildRef
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
  librarySelections?(
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatLibrarySelection[]>;
  answerLibrarySelection?(
    attachmentId: string,
    reviewId: string,
    answer: NativeChatLibrarySelectionAnswer
  ): Promise<NativeChatControlReceipt>;
  transcript(attachmentId: string): Promise<readonly NativeChatMessage[]>;
  transcriptPage?(
    attachmentId: string,
    before?: string
  ): Promise<NativeChatTranscriptPage>;
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
