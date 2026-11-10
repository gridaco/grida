// GRIDA-SEC-004 — renderer-safe native chat projection.
export type NativeChatAttachment = Readonly<{
  attachmentId: string;
  sessionId: string;
}>;

export type NativeChatOperatingRegime = "act" | "plan";

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
}>;

export type NativeChatCatalogChange = Omit<NativeChatCatalogEntry, "sessionId">;

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
  admissionPaused: boolean;
  current: NativeChatTurn | null;
  latest: NativeChatTurn | null;
}>;

export type NativeChatObservation = Readonly<{
  observationId: string;
  snapshot: NativeChatSnapshot;
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
}>;

export type NativeChatQueueItem = Readonly<{
  inputId: string;
  preview: string | null;
  goalStart?: NativeChatGoalRequest;
  operatingRegime?: NativeChatOperatingRegime;
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
      reason: "delivery_limit";
    }>;

/** Available only for a main-selected native chat in the current workspace. */
export type DesktopNativeChat = {
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
  create(): Promise<NativeChatAttachment>;
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
  inputReceipt(
    attachmentId: string,
    inputId: string
  ): Promise<NativeChatAcceptance>;
  observe(attachmentId: string): Promise<NativeChatObservation>;
  turnSummary?(
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatTurnSummary>;
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
