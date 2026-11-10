// GRIDA-SEC-004 — goal controls use the exact attached inspection.
import type {
  NativeChatGoal,
  NativeChatGoalControl,
  NativeChatGoalReceipt,
  NativeChatGoalRequest,
  NativeChatGoalStatus,
  NativeChatGoalUsage,
} from "@grida/desktop-bridge";

const OBJECTIVE_LIMIT = 8192;
const CRITERION_LIMIT = 1024;
const MAX_CRITERIA = 16;
const PROGRESS_LIMIT = 4096;
const MAX_U32 = 0xffffffff;
const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const STATUSES = ["active", "complete", "exhausted", "cleared"] as const;
const BLOCKERS = [
  "needs_input",
  "capability_unavailable",
  "no_progress",
  "unverified_completion",
  "uncertain_work",
] as const;

export type NativeGoalInspection = Readonly<{
  sessionId: string;
  sessionRevision: number;
  stateRevision: number;
  basis: Readonly<{ goal: string; revision: number }> | null;
  goal: NativeChatGoal | null;
}>;

export class NativeAgentGoals {
  private readonly issued = new WeakSet<NativeGoalInspection>();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>
  ) {}

  private static readRequest(value: unknown): NativeChatGoalRequest {
    const input = object(value);
    const allowance = object(input.allowance);
    if (Object.keys(input).length !== 4 || Object.keys(allowance).length !== 2)
      throw invalid();
    return {
      objective: text(input.objective, OBJECTIVE_LIMIT),
      criteria: criteria(input.criteria),
      allowance: {
        workTurns: number(allowance.workTurns, 1, MAX_U32),
        inferenceSteps: number(allowance.inferenceSteps, 1, MAX_U32),
      },
      automatic: flag(input.automatic),
    };
  }

  static readStoredRequest(value: unknown): NativeChatGoalRequest {
    const row = object(value);
    const objective = object(row.objective);
    return Object.freeze({
      objective: text(objective.description, OBJECTIVE_LIMIT),
      criteria: Object.freeze(criteria(objective.criteria)),
      allowance: usage(row.allowance, 1),
      automatic: flag(row.automatic),
    });
  }

  start(
    sessionId: string,
    inputId: string,
    request: unknown
  ): Promise<unknown> {
    const { objective, criteria, allowance, automatic } =
      NativeAgentGoals.readRequest(request);
    return this.request("_co.grida/goal/start", {
      sessionId,
      inputId,
      prompt: [{ type: "text", text: objective }],
      goal: {
        objective: { description: objective, criteria },
        allowance: {
          work_turns: allowance.workTurns,
          inference_steps: allowance.inferenceSteps,
        },
        automatic,
      },
    });
  }

  async inspect(
    sessionId: string,
    expectedRevision: number
  ): Promise<NativeGoalInspection> {
    const result = object(
      await this.request("_co.grida/goal/inspect", { sessionId })
    );
    if (result.session !== sessionId) throw invalid();
    const sessionRevision = number(result.revision);
    if (sessionRevision !== expectedRevision)
      throw new Error("native_chat_goal_changed");
    const stateRevision = number(result.stateRevision);
    if (result.goal === null) {
      return Object.freeze({
        sessionId,
        sessionRevision,
        stateRevision,
        basis: null,
        goal: null,
      });
    }
    const row = object(result.goal);
    const rawBasis = object(row.basis);
    const basis = Object.freeze({
      goal: identity(rawBasis.goal),
      revision: number(rawBasis.revision, 1),
    });
    const rawReservation =
      row.reservation === null ? null : object(row.reservation);
    const uncertainSteps =
      rawReservation && rawReservation.uncertain_steps !== null
        ? number(rawReservation.uncertain_steps, 0, MAX_U32)
        : null;
    const reservation =
      rawReservation &&
      Object.freeze({
        turnId: identity(rawReservation.turn),
        inferenceSteps: number(rawReservation.inference_steps, 1, MAX_U32),
        uncertain: uncertainSteps !== null,
      });
    const goal: NativeChatGoal = Object.freeze({
      ...NativeAgentGoals.readStoredRequest(row),
      goalId: basis.goal,
      state: state(row.status),
      paused: flag(row.paused),
      progress:
        row.progress === null ? null : text(row.progress, PROGRESS_LIMIT),
      spent: usage(row.spent),
      remaining: usage(row.remaining),
      reservation,
    });
    const inspection = Object.freeze({
      sessionId,
      sessionRevision,
      stateRevision,
      basis,
      goal,
    });
    this.issued.add(inspection);
    return inspection;
  }

  async control(
    sessionId: string,
    inspection: NativeGoalInspection,
    change: NativeChatGoalControl
  ): Promise<NativeChatGoalReceipt> {
    if (
      !this.issued.has(inspection) ||
      inspection.sessionId !== sessionId ||
      !inspection.basis
    )
      throw new Error("native_chat_goal_observation_unavailable");
    const requestId = identity(change.requestId);
    const reply = object(
      await this.request("_co.grida/goal/control", {
        sessionId,
        requestId,
        expectedSessionRevision: inspection.sessionRevision,
        expectedStateRevision: inspection.stateRevision,
        basis: inspection.basis,
        change: {
          action: member(change.action, ["pause", "resume", "clear"] as const),
        },
      })
    );
    if (reply.sessionId !== sessionId || reply.requestId !== requestId)
      throw invalid();
    const turnId = reply.turnId === null ? null : identity(reply.turnId);
    const journalPosition =
      reply.journalPosition === null ? null : number(reply.journalPosition);
    if (
      (turnId === null) !== (journalPosition === null) ||
      (turnId && turnId !== inspection.goal?.reservation?.turnId)
    )
      throw invalid();
    return {
      sessionId,
      requestId,
      sessionRevision: number(reply.sessionRevision),
      stateRevision: number(reply.stateRevision),
      turnId,
      journalPosition,
    };
  }
}

function state(value: unknown): NativeChatGoalStatus {
  const row = object(value);
  return row.status === "blocked"
    ? Object.freeze({ status: "blocked", reason: member(row.reason, BLOCKERS) })
    : Object.freeze({ status: member(row.status, STATUSES) });
}

function usage(value: unknown, minimum = 0): NativeChatGoalUsage {
  const row = object(value);
  return Object.freeze({
    workTurns: number(row.work_turns, minimum, MAX_U32),
    inferenceSteps: number(row.inference_steps, minimum, MAX_U32),
  });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, limit: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > limit
  )
    throw invalid();
  return value;
}

function criteria(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CRITERIA)
    throw invalid();
  return value.map((entry: unknown) => text(entry, CRITERION_LIMIT));
}

function number(
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw invalid();
  return value;
}

function identity(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw invalid();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid();
  return value;
}

function member<T extends string>(value: unknown, values: readonly T[]): T {
  const result = values.find((candidate) => value === candidate);
  if (!result) throw invalid();
  return result;
}

function invalid(): Error {
  return new Error("native_chat_goal_invalid");
}
