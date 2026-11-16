// GRIDA-SEC-004 — renderer-visible child work is scoped to the attached parent.
import type {
  NativeChatEffort,
  NativeChatMessage,
  NativeChatTurn,
  NativeChatTurnRecord,
} from "./native-chat";

export type NativeSubagentEntry = Readonly<{
  childId: string;
  name: string;
}>;

export type NativeSubagentPage = Readonly<{
  children: readonly NativeSubagentEntry[];
  nextAfterChildId: string | null;
}>;

/** Host-reported child state; Active includes held or unresolved work. */
export type NativeSubagentStatus =
  | "ready"
  | "queued"
  | "running"
  | "paused"
  | "interrupted"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "uncertain";

export type NativeSubagentSummary = Readonly<
  NativeSubagentEntry & {
    kind: "named" | "review";
    status: NativeSubagentStatus;
    section: "active" | "done";
    /** UTC milliseconds of the latest recorded start or settlement, when known. */
    updatedAtMs?: number;
    latestTurnId?: string;
  }
>;

/** One retained lifecycle event, correlated to the exact child assignment. */
export type NativeSubagentLifecycleEvent = Readonly<{
  eventId: string;
  childId: string;
  name: string;
  kind: "started" | "finished";
  childTurnId: string;
  parentTurnId: string;
  inputId: string;
  atMs: number;
  status?: NonNullable<NativeChatTurn["status"]>;
}>;

export type NativeSubagentActivityPage = Readonly<{
  children: readonly NativeSubagentSummary[];
  nextAfterChildId: string | null;
  counts: Readonly<{
    active: number;
    done: number;
    /** False means these counts are lower bounds over a bounded catalog scan. */
    complete: boolean;
  }>;
  observedAtMs: number;
  /** Events for the children in this page, with stable identities for merging. */
  events: readonly NativeSubagentLifecycleEvent[];
  /** False when a child's bounded retained window omitted older events. */
  eventsComplete: boolean;
}>;

/** Captured execution; null effort means no explicit reasoning level was captured. */
export type NativeSubagentExecution = Readonly<{
  model: string | null;
  effort: NativeChatEffort | null;
}>;

export type NativeSubagentConversationMessage = Readonly<
  NativeChatMessage & {
    truncated?: true;
    /** Actual in-flight output; the next read replaces this message by identity. */
    live?: true;
  }
>;

export type NativeSubagentConversationTurn = Readonly<
  NativeChatTurnRecord & { execution: NativeSubagentExecution }
>;

/** A read-only conversation page; never an ordinary child session attachment. */
export type NativeSubagentConversation = Readonly<{
  childId: string;
  name: string;
  kind: "named" | "review";
  view: number;
  messages: readonly NativeSubagentConversationMessage[];
  turns: readonly NativeSubagentConversationTurn[];
  /** Latest/current captured execution, or null before any accepted assignment. */
  execution: NativeSubagentExecution | null;
  /** Opaque continuation bound to this attachment, parent and child. */
  older: string | null;
  live: Readonly<{ available: boolean; truncated: boolean }>;
  observedAtMs: number;
}>;

export type NativeSubagentTurn = Pick<
  NativeChatTurn,
  "turnId" | "disposition" | "status" | "paused" | "cancelled"
>;

export type NativeSubagentResult = Readonly<{
  turnId: string;
  status: NonNullable<NativeSubagentTurn["status"]>;
  text: string;
  textTruncated: boolean;
}>;

export type NativeSubagentWork = Readonly<{
  inputId: string;
  parentTurnId: string;
  instructionPreview: string;
  instructionTruncated: boolean;
  disposition: "queued" | "claimed" | "completed" | "superseded" | "withdrawn";
  turn: NativeSubagentTurn | null;
  result: NativeSubagentResult | null;
}>;

export type NativeSubagentInspection = Readonly<
  NativeSubagentEntry & {
    workTurns: number;
    reserved: number;
    admissionPaused: boolean;
    queuedInputIds: readonly string[];
    current: NativeSubagentTurn | null;
    assignment: NativeSubagentWork | null;
  }
>;

export type NativeSubagentObservation = Readonly<{
  child: NativeSubagentInspection;
  stopObservationId: string | null;
  turnControls?: readonly NativeSubagentTurnControl["kind"][];
  childControls?: Readonly<{
    observationId: string;
    available: readonly NativeSubagentChildControl["kind"][];
    pendingMessages?: number;
  }>;
}>;

export type NativeSubagentTurnControl =
  | Readonly<{ kind: "pause" | "resume" }>
  | Readonly<{ kind: "steer"; instructions: string }>;

export type NativeSubagentChildControl =
  | Readonly<{ kind: "message"; text: string }>
  | Readonly<{ kind: "withdraw"; inputId: string }>
  | Readonly<{ kind: "resume-queue" }>;

export type NativeSubagentCreate = Readonly<{
  requestId: string;
  name: string;
  workTurns: number;
}>;

export type NativeSubagentAssignmentInput = Readonly<{
  childId: string;
  parentObservationId: string;
  inputId: string;
  instructions: string;
}>;

export interface NativeSubagentClient {
  subagentActivity?(
    attachmentId: string,
    afterChildId?: string
  ): Promise<NativeSubagentActivityPage>;
  subagentConversation?(
    attachmentId: string,
    childId: string,
    before?: string
  ): Promise<NativeSubagentConversation>;
  listSubagents(
    attachmentId: string,
    afterChildId?: string
  ): Promise<NativeSubagentPage>;
  inspectSubagent(
    attachmentId: string,
    childId: string,
    inputId?: string
  ): Promise<NativeSubagentObservation>;
  createSubagent(
    attachmentId: string,
    input: NativeSubagentCreate
  ): Promise<NativeSubagentEntry>;
  assignSubagent(
    attachmentId: string,
    input: NativeSubagentAssignmentInput
  ): Promise<NativeSubagentWork>;
  stopSubagent(
    attachmentId: string,
    stopObservationId: string,
    requestId: string
  ): Promise<void>;
  controlSubagentTurn?(
    attachmentId: string,
    observationId: string,
    requestId: string,
    control: NativeSubagentTurnControl
  ): Promise<void>;
  controlSubagentChild?(
    attachmentId: string,
    observationId: string,
    requestId: string,
    control: NativeSubagentChildControl
  ): Promise<void>;
}
