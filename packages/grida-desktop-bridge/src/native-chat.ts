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

/** The native destination and first input are durably bound to the draft. */
export type NativeChatDraftAttachment = NativeChatAttachment &
  Readonly<{
    /** Reuse this identity for the first submission and every retry of it. */
    firstInputId: string;
  }>;

export type NativeChatOperatingRegime = "act" | "plan";
/** Full access deliberately removes command filesystem and network confinement. */
export type NativeChatPermissionMode = "restricted" | "full_access";
export type NativeChatPermissionReview = Readonly<{
  reviewId: string;
  chatTitle: string;
  workspaceName: string;
}>;
export type NativeChatPermissionState = Readonly<{
  sessionId: string;
  revision: number;
  mode: NativeChatPermissionMode;
  available: readonly NativeChatPermissionMode[];
}>;

/**
 * Effort for one request, from least to most. `low` through `xhigh` set the
 * model's reasoning; `ultra` also adds the extended harness. `standard` is the
 * standard harness at `medium` reasoning.
 */
export type NativeChatEffort =
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "ultra"
  | "standard";

/** Saved choices contain public identities only; never credentials or paths. */
export type NativeChatSelection = Readonly<{
  profileId: string | null;
  /** The exact wire model identity, not its display label. */
  modelId: string;
  effort: NativeChatEffort;
}>;

/** Exactly one logical chat or stable unsent draft, scoped by native Main. */
export type NativeChatSelectionTarget =
  | Readonly<{ sessionId: string; draftId?: never }>
  | Readonly<{ draftId: string; sessionId?: never }>;

export type NativeChatSelectionState = Readonly<{
  target: NativeChatSelectionTarget;
  revision: number;
  /** Null means legacy identity could not be resolved, without a fallback. */
  selection: NativeChatSelection | null;
  /** A saved choice can remain selected while its connection is unavailable. */
  available: boolean;
}>;

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

/** Global user configuration; never a workspace hook-definition registry. */
export type NativeGlobalHookInspection = Readonly<{
  configPath: string;
  exists: boolean;
  hooks: readonly (NativeHookInfo & { trusted: boolean })[];
  diagnostics: readonly string[];
  activation: "new_connections";
}>;

export type DesktopHooks = Readonly<{
  inspect(): Promise<NativeGlobalHookInspection>;
  reload(): Promise<NativeGlobalHookInspection>;
  review(
    id: string,
    revision: string
  ): Promise<NativeGlobalHookInspection | null>;
  open_config(): Promise<void>;
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
  selectionRevision?: number;
}>;

/**
 * The original selected File, not a preview or a caller-claimed disk path.
 * Preload and Main verify disk origin or capture the selected bytes once.
 */
export type NativeChatSelectedImageInput = Readonly<{
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
  file: File;
  /** Optional original picker/drop File, used only to verify native disk origin. */
  originalFile?: File;
  operatingRegime: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  selectionRevision?: number;
}>;

export type NativeChatFileInput = Readonly<{
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
  name: string;
  bytes: ArrayBuffer;
  operatingRegime: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  selectionRevision?: number;
}>;

/**
 * What the composer showed for an attachment: a small poster frame (a JPEG or
 * PNG data URL) and, for a video, its duration and dimensions. Kept with the
 * message so the transcript shows the same card after reopening.
 */
export type NativeChatAttachmentPreview = Readonly<{
  poster?: string;
  durationMs?: number;
  width?: number;
  height?: number;
}>;

/**
 * A file or folder attached by reference: the agent receives its path and facts, never
 * its bytes. `file` must be the File the person dropped, pasted or picked; the
 * Desktop preload resolves its path, which never reaches the renderer.
 */
export type NativeChatFileReferenceInput = Readonly<{
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
  file: File;
  mimeType?: string;
  preview?: NativeChatAttachmentPreview;
  operatingRegime: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  selectionRevision?: number;
}>;

export type NativeChatPage = Readonly<{
  sessionIds: readonly string[];
  titles?: readonly Readonly<{ sessionId: string; title: string }>[];
  /** Latest local turn's settlement or start time; absent on older hosts. */
  lastActivity?: readonly Readonly<{ sessionId: string; atMs: number }>[];
  nextCursor: string | null;
}>;

export type NativeChatProfileChoice = Readonly<{
  id: string;
  connection: string;
  model: string;
  /** This exact binding accepts the product's normalized PNG input; no grant. */
  imageInput?: true;
  /** The model accepts a reasoning level, so every effort stop applies. */
  reasoning?: true;
  /** The connection can run Ultra's extended work and independent review. */
  ultra?: true;
  /** The model's context window in tokens, when known. */
  contextWindow?: number;
}>;

export type NativeChatProfileCatalog = Readonly<{
  active: string | null;
  /** Last explicitly saved app default, even when its connection is unavailable. */
  newChatDefault?: NativeChatSelection;
  /** Main guards worker replacement and preserves accepted work across chats. */
  modelChanges?: true;
  /** A currently offered choice recommended only for an untouched new chat. */
  recommendedProfileId?: string;
  /** Context window of the default model, when known. */
  defaultContextWindow?: number;
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
  /** Latest local turn activity, not archive time or exact message time. */
  lastActivityAtMs?: number;
  deletionAvailable?: true;
}>;

export type NativeChatCatalogChange = Pick<
  NativeChatCatalogEntry,
  "revision" | "title" | "archived"
>;

/**
 * A temporary side chat: an ordinary chat forked from its parent's committed
 * conversation and attached to the frame that opened it. Every chat method
 * takes its `attachmentId`; closing it discards the side chat.
 */
export type NativeChatSideAttachment = NativeChatAttachment &
  Readonly<{
    parentSessionId: string;
    /** The parent's model context had been compacted. */
    compacted: boolean;
    /** The copy leaves out parent material it cannot carry. */
    omitted: boolean;
  }>;

/** What a side chat refuses; its snapshot lists each one. */
export type NativeChatSideRefusal =
  | "fork"
  | "side_chat"
  | "compaction"
  | "goals"
  | "subagents"
  | "delegation"
  | "wakeups"
  | "catalog";

export type NativeChatSideSnapshot = Readonly<{
  parentSessionId: string;
  temporary: true;
  unavailable: readonly NativeChatSideRefusal[];
  /**
   * The title generated from the side chat's first message, once written.
   * It lives and ends with the side chat and is never listed.
   */
  title?: string;
}>;

export type NativeChatReadiness =
  | "native-starting"
  | "native-ready"
  | "native-unavailable"
  | "native-gateway-unavailable"
  | "native-provider-key-required"
  | "native-provider-model-unavailable"
  | "native-hooks-review-required"
  | "native-hooks-configuration-invalid"
  | "native-provider-endpoint-https-required"
  | "native-provider-endpoint-approval-required"
  | "native-workspace-capacity";

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
  /** Parent-scoped status, lifecycle and real child conversation observation. */
  subagentActivityAvailable?: true;
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
  /** Present for a side chat. */
  side?: NativeChatSideSnapshot;
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

/** How the host classified recorded tool work for presentation. */
export type NativeChatActivityKind =
  | "read"
  | "search"
  | "edit"
  | "execute"
  | "generate"
  | "integration"
  | "delegate"
  | "ask"
  | "other";

export type NativeChatActivityOutcome =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "uncertain";

/** Captured pixels from one successful tool result, retained by the native host. */
export type NativeChatToolImage = Readonly<{
  /** Main-issued identity for this exact chat, turn, call and result image. */
  previewId: string;
  mimeType: "image/png";
  size: number;
}>;

/** One recorded tool call, in the order its message requested it. */
export type NativeChatActivity = Readonly<{
  callId: string;
  /** First-publication position within this call's owning turn; never an execution revision. */
  activityOrder?: number;
  /** This host could not recover a retained position for this visible fact. */
  activityOrderIncomplete?: true;
  /** The tool's identifier. */
  title: string;
  kind: NativeChatActivityKind;
  /** The configured integration name for an integration tool. */
  source?: string;
  outcome: NativeChatActivityOutcome;
  /** The call's arguments for display; long values are shortened. */
  input?: unknown;
  /** The call's result for display, once it has one. */
  output?: Readonly<{
    text: string;
    /** The tool or the display shortened the result. */
    truncated: boolean;
    /** The tool's structured result, when small. */
    structured?: unknown;
    /** Bounded retained image metadata; bytes require the dedicated reader. */
    images?: readonly NativeChatToolImage[];
    /** Additional result images withheld by the bounded display projection. */
    omittedImages?: number;
  }>;
}>;

export type NativeChatMessage = Readonly<{
  messageId: string;
  /** First nonempty public publication, compared only within the same turn. */
  activityOrder?: number;
  /** Missing retained order is explicit; clients must not infer it from arrival. */
  activityOrderIncomplete?: true;
  role: "user" | "assistant";
  text: string;
  /** The turn that committed this message. Absent for inherited history. */
  turnId?: string;
  /**
   * The host's final-answer classification for an assistant message. Other
   * assistant messages are commentary that preceded the answer.
   */
  phase?: "answer" | "progress";
  activity?: readonly NativeChatActivity[];
  /** Files the person attached to this message. Their bytes stay with the host. */
  attachments?: readonly NativeChatMessageAttachment[];
}>;

/** A file attached to a person's message, named for display. */
export type NativeChatMessageAttachment = Readonly<{
  name: string;
  mimeType?: string;
  /** Bytes, when the host recorded the size. */
  size?: number;
  /** A file attached by reference, with the preview the composer showed. */
  preview?: NativeChatAttachmentPreview;
  /**
   * Opaque Main-issued token for the exact retained image; contains no path.
   * Queued tokens require the queued-preview reader and observed input basis.
   */
  previewId?: string;
}>;

/** Recorded outcome and wall-clock interval of a turn in a transcript page. */
export type NativeChatTurnRecord = Readonly<{
  turnId: string;
  status: NonNullable<NativeChatTurn["status"]> | null;
  /** UTC milliseconds at which the turn started. */
  startedAtMs: number;
  /** UTC milliseconds at which the turn first settled; absent until then. */
  settledAtMs?: number;
  /** The turn's input started a goal. */
  goalStart?: true;
  /**
   * The tokens the turn's context occupied at its largest model call, as the
   * provider reported them: the whole prompt (instructions, tools, history)
   * plus the reply. Absent when no call reported usage.
   */
  contextTokens?: number;
  /**
   * The turn summarized earlier context into the summary the model now reads.
   * It adds no messages; the transcript shows it as a note in its place.
   */
  compaction?: Readonly<{ summary: string; automatic: boolean }>;
}>;

export type NativeChatTranscriptPage = Readonly<{
  view: number;
  messages: readonly NativeChatMessage[];
  /** Turns that contributed messages, in history order. */
  turns?: readonly NativeChatTurnRecord[];
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
}>;

export type NativeChatQueueItem = Readonly<{
  inputId: string;
  preview: string | null;
  /** Exact captured input is one plain text part. Absent on older hosts. */
  textOnly?: boolean;
  /** Native host can replace this waiting input's text while retaining its other parts. */
  textEditable?: boolean;
  /** Display metadata only; bytes require a current queued-preview read. */
  attachments?: readonly NativeChatMessageAttachment[];
  goalStart?: NativeChatGoalRequest;
  operatingRegime?: NativeChatOperatingRegime;
  effort?: "ultra";
}>;

/** Read-only display of one input still waiting in the observed queue. */
export type NativeChatQueuedMessage = Readonly<{
  inputId: string;
  text: string;
  /** Exact captured input is one plain text part, independently of display. */
  textOnly?: boolean;
  /** Factual eligibility for the negotiated text-preserving replacement operation. */
  textEditable?: boolean;
  attachments?: readonly NativeChatMessageAttachment[];
}>;

export type NativeChatQueuePage = Readonly<{
  items: readonly NativeChatQueueItem[];
  offset: number;
  previousOffset: number | null;
  nextOffset: number | null;
}>;

export type NativeChatQueueAction =
  | { action: "replace"; inputId: string; text: string }
  /** Replace only text, retaining captured resources and settings. Never fall back to replace. */
  | { action: "replaceText"; inputId: string; text: string }
  | { action: "withdraw"; inputId: string }
  | { action: "move"; inputId: string; direction: "up" | "down" }
  /** Place a waiting message at a position in the whole queue (0 is next). */
  | { action: "place"; inputId: string; index: number }
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
  /** Omitted, the host applies the product's default allowance. */
  allowance?: NativeChatGoalUsage;
  automatic: boolean;
  operatingRegime?: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  selectionRevision?: number;
  namedChildId?: string;
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
  Omit<
    NativeChatGoalRequest,
    "operatingRegime" | "allowance" | "selectionRevision"
  > & {
    goalId: string;
    allowance: NativeChatGoalUsage;
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
  /** Writes are asked only for the workspace's agent settings file. */
  tool: "read_file" | "list_files" | "search_text" | "write_file" | "edit_file";
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
  /** The same first-publication coordinate retained by replayed messages. */
  activityOrder?: number;
  activityOrderIncomplete?: true;
}>;

export type NativeChatActivityUpdate = Readonly<{
  kind: "activity";
  messageId: string;
  turnId: string;
  activity: NativeChatActivity;
}>;

/**
 * A command the agent started for a chat that kept running in the background.
 * It runs across turns until the agent ends it, the person stops it, the chat
 * is deleted, its window closes, or the app quits.
 */
export type NativeChatBackgroundProcess = Readonly<{
  /** Unique within the chat and never reused. */
  processId: number;
  /** The shell command line as the agent wrote it. */
  command: string;
  /** Absolute working directory. */
  cwd: string;
  /** Started with a pseudo-terminal. */
  terminal: boolean;
  /** Unix epoch milliseconds. */
  startedAt: number;
  state: "running" | "ended";
  /** Set when the process ended with an exit code. */
  exitCode: number | null;
}>;

/** The chat's complete current process list, sent whenever it changes. */
export type NativeChatBackgroundProcessesUpdate = Readonly<{
  kind: "processes";
  processes: readonly NativeChatBackgroundProcess[];
}>;

export type NativeChatStreamUpdate =
  | NativeChatTextUpdate
  | NativeChatActivityUpdate
  | NativeChatBackgroundProcessesUpdate
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
  /**
   * Starts the admitted workspace when requested. Setup failures are fixed
   * readiness values. Treat an unrecognized value as unavailable.
   */
  status(start?: boolean): Promise<NativeChatReadiness>;
  /** Take the latest notification click for this workbench once, if still current. */
  takeNotificationFocus(): Promise<NativeChatNotificationFocus | null>;
  list(cursor?: string | null): Promise<NativeChatPage>;
  profiles?(): Promise<NativeChatProfileCatalog | null>;
  /**
   * On the Welcome screen only: the connections a new chat can choose before a
   * workspace opens, with nothing active or saved. Listing starts nothing.
   */
  welcomeProfiles?(): Promise<NativeChatProfileCatalog | null>;
  /** Inspect reviewed definitions and retained results without running handlers. */
  inspectHooks?(attachmentId?: string): Promise<NativeHookInspection>;
  /** Main owns file selection and the explicit review of executable authority. */
  importHook?(): Promise<NativeHookInspection | null>;
  removeHook?(id: string, revision: string): Promise<NativeHookInspection>;
  selectProfile?(selection: NativeChatProfileSelection): Promise<void>;
  /** Read saved identity, initializing a new draft from defaults, without a worker. */
  /** Negotiated native permission selection; absent/false keeps Default. */
  acceptsPermissionMode?(): Promise<boolean>;
  permissionMode?(attachmentId: string): Promise<NativeChatPermissionState>;
  /** Main issues a short-lived intent bound to this exact chat and revision. */
  reviewPermissionMode?(
    attachmentId: string,
    expectedRevision: number,
    requestId: string
  ): Promise<NativeChatPermissionReview>;
  /** The owned app confirmation answers Main's exact intent. Null means cancel. */
  setPermissionMode?(
    attachmentId: string,
    expectedRevision: number,
    requestId: string,
    mode: NativeChatPermissionMode,
    review?: Readonly<{ reviewId: string; confirmed: boolean }>
  ): Promise<NativeChatPermissionState | null>;
  selection?(
    target: NativeChatSelectionTarget
  ): Promise<NativeChatSelectionState>;
  /**
   * Explicitly save a complete resulting choice and the new-chat default.
   * Main resolves the profile's model; a stale revision or invalid choice rejects.
   * Retrying the same operation id and arguments preserves the original result;
   * reusing that id for different arguments rejects.
   */
  updateSelection?(
    target: NativeChatSelectionTarget,
    expectedRevision: number,
    operationId: string,
    choice: Readonly<{
      profileId: string | null;
      effort: NativeChatEffort;
    }>
  ): Promise<NativeChatSelectionState>;
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
  /** Reopening the same draft reuses its durable destination and first input. */
  createFromDraft?(draftId: string): Promise<NativeChatDraftAttachment>;
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
  /**
   * Open a new side chat of an attached chat. A chat can have several side
   * chats open; each is attached to this frame only.
   */
  openSideChat?(attachmentId: string): Promise<NativeChatSideAttachment>;
  /** Discard a side chat by its own attachment. */
  closeSideChat?(sideAttachmentId: string): Promise<void>;
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
    editorSvgTargetId?: string,
    selectionRevision?: number
  ): Promise<NativeChatAcceptance>;
  acceptsEffort?(): Promise<boolean>;
  acceptsGoalEffort?(): Promise<boolean>;
  /** Whether this chat host lists and stops background processes. */
  acceptsBackgroundProcesses?(): Promise<boolean>;
  /** Running processes first, then ended ones not yet collected. */
  backgroundProcesses?(
    attachmentId: string
  ): Promise<readonly NativeChatBackgroundProcess[]>;
  /** Stops the named processes, or every process of the chat when omitted. */
  stopBackgroundProcesses?(
    attachmentId: string,
    processIds?: readonly number[]
  ): Promise<readonly number[]>;
  acceptsPng?(): Promise<boolean>;
  acceptsLibrarySelection?(): Promise<boolean>;
  submitWithLibrarySelection?(
    attachmentId: string,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    effort?: NativeChatEffort,
    selectionRevision?: number
  ): Promise<NativeChatAcceptance>;
  acceptsFile?(): Promise<boolean>;
  submitImage?(
    attachmentId: string,
    input: NativeChatImageInput
  ): Promise<NativeChatAcceptance>;
  /**
   * Whether the selected model and host accept selected raster image Files.
   * False for text-only models; independent of legacy bounded inline PNG intake.
   */
  acceptsSelectedImage?(): Promise<boolean>;
  submitSelectedImage?(
    attachmentId: string,
    input: NativeChatSelectedImageInput
  ): Promise<NativeChatAcceptance>;
  submitFile?(
    attachmentId: string,
    input: NativeChatFileInput
  ): Promise<NativeChatAcceptance>;
  /** Whether this chat takes files by reference. */
  acceptsFileReference?(): Promise<boolean>;
  /** Native Desktop supports folder references, under the same tool permissions. */
  acceptsDirectoryReference?(): Promise<boolean>;
  /** Whether this File names a resource on disk that can be attached by reference. */
  canReferenceFile?(file: File): boolean;
  submitFileReference?(
    attachmentId: string,
    input: NativeChatFileReferenceInput
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
  /** Read a recorded input image for display. Grants no model or filesystem access. */
  readAttachmentPreview?(
    attachmentId: string,
    previewId: string
  ): Promise<ArrayBuffer>;
  /** Read captured tool-result pixels. Accepts no source path or attachment-image token. */
  readToolImage?(attachmentId: string, previewId: string): Promise<ArrayBuffer>;
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
  /**
   * Whether the native host supports replaceText. Check this optional method
   * and the input's textEditable fact; neither attachment metadata nor
   * textOnly grants text-preserving replacement authority.
   */
  acceptsQueuedTextReplacement?(): Promise<boolean>;
  queuedText?(
    attachmentId: string,
    observationId: string,
    inputId: string
  ): Promise<string>;
  /**
   * Inspect full queued text and attachment metadata without granting edit or
   * steering authority. Older hosts omit this method. Stale observations and
   * inputs that are no longer queued reject.
   */
  queuedMessage?(
    attachmentId: string,
    observationId: string,
    inputId: string
  ): Promise<NativeChatQueuedMessage>;
  /** Read one opaque preview from this exact observed queued input. */
  readQueuedAttachmentPreview?(
    attachmentId: string,
    observationId: string,
    inputId: string,
    previewId: string
  ): Promise<ArrayBuffer>;
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
