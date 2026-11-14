// GRIDA-SEC-004 — renderer-visible child work is scoped to the attached parent.
import type { NativeChatTurn } from "./native-chat";

export type NativeSubagentEntry = Readonly<{
  childId: string;
  name: string;
}>;

export type NativeSubagentPage = Readonly<{
  children: readonly NativeSubagentEntry[];
  nextAfterChildId: string | null;
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
