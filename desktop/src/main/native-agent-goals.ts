// GRIDA-SEC-004 — goal controls use the exact attached inspection.
import type {
  NativeChatGoal,
  NativeChatGoalControl,
  NativeChatGoalObjective,
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
  static readonly completionCapability = "co.grida/goal/confirm-completion";
  static readonly manualContinuationCapability =
    "co.grida/goal/manual-continuation";
  static readonly fundedReviewCapability = "co.grida/goal/funded-review";
  static readonly namedChildCapability = "co.grida/goal/named-child";
  static readonly spendingCapability = "co.grida/goal/spending";
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
    const operatingRegime =
      input.operatingRegime === undefined
        ? undefined
        : member(input.operatingRegime, ["act", "plan"] as const);
    const effort =
      input.effort === undefined
        ? undefined
        : member(input.effort, [
            "low",
            "medium",
            "high",
            "xhigh",
            "ultra",
            "standard",
          ] as const);
    const allowWakeup = input.allowWakeup === true;
    const maxCostMills =
      input.maxCostMills === undefined
        ? undefined
        : amount(input.maxCostMills, true);
    const namedChildId =
      input.namedChildId === undefined
        ? undefined
        : identity(input.namedChildId);
    if (
      Object.keys(input).length !==
        4 +
          Number(operatingRegime !== undefined) +
          Number(effort !== undefined) +
          Number(allowWakeup) +
          Number(maxCostMills !== undefined) +
          Number(namedChildId !== undefined) ||
      Object.keys(allowance).length !== 2
    )
      throw invalid();
    if (
      maxCostMills !== undefined &&
      number(allowance.inferenceSteps, 1, MAX_U32) > 4096
    )
      throw new Error("native_chat_goal_spending_allowance_limit");
    return {
      objective: text(input.objective, OBJECTIVE_LIMIT),
      criteria: criteria(input.criteria),
      allowance: {
        workTurns: number(allowance.workTurns, 1, MAX_U32),
        inferenceSteps: number(allowance.inferenceSteps, 1, MAX_U32),
      },
      automatic: flag(input.automatic),
      ...(operatingRegime && { operatingRegime }),
      ...(effort && { effort }),
      ...(namedChildId && { namedChildId }),
      ...(allowWakeup && { allowWakeup: true }),
      ...(maxCostMills !== undefined && { maxCostMills }),
    };
  }

  static readStoredRequest(value: unknown): NativeChatGoalRequest {
    const row = object(value);
    const objective = object(row.objective);
    const namedChildId = row.namedChildId ?? row.named_child;
    return Object.freeze({
      objective: text(objective.description, OBJECTIVE_LIMIT),
      criteria: Object.freeze(criteria(objective.criteria)),
      allowance: usage(row.allowance, 1),
      automatic: flag(row.automatic),
      ...(row.maxCostMills !== undefined
        ? { maxCostMills: amount(row.maxCostMills, true) }
        : row.spending !== undefined
          ? { maxCostMills: amount(object(row.spending).maxCostMills, true) }
          : {}),
      ...(namedChildId === undefined
        ? {}
        : { namedChildId: identity(namedChildId) }),
      ...(row.effort === undefined
        ? {}
        : { effort: member(row.effort, ["ultra"] as const) }),
    });
  }

  static readObjective(value: unknown): NativeChatGoalObjective {
    const objective = object(value);
    if (Object.keys(objective).length !== 2) throw invalid();
    return {
      description: text(objective.description, OBJECTIVE_LIMIT),
      criteria: criteria(objective.criteria),
    };
  }

  start(
    sessionId: string,
    inputId: string,
    request: unknown,
    capabilities: {
      fundedReview: boolean;
      namedChild: boolean;
      wakeups: boolean;
      spending?: boolean;
    }
  ): Promise<unknown> {
    const {
      objective,
      criteria,
      allowance,
      automatic,
      operatingRegime,
      effort,
      allowWakeup,
      namedChildId,
      maxCostMills,
    } = NativeAgentGoals.readRequest(request);
    if (maxCostMills !== undefined && !capabilities.spending)
      throw new Error("native_chat_goal_spending_unavailable");
    if (
      allowWakeup &&
      (!capabilities.wakeups ||
        effort === "ultra" ||
        operatingRegime === "plan")
    )
      throw new Error("native_chat_goal_wakeup_unavailable");
    if (effort === "ultra" && !capabilities.fundedReview)
      throw new Error("native_chat_goal_effort_unavailable");
    if (
      namedChildId &&
      (effort !== "ultra" ||
        !capabilities.namedChild ||
        operatingRegime === "plan")
    )
      throw new Error("native_chat_goal_named_child_unavailable");
    const regime =
      operatingRegime ?? (allowWakeup || namedChildId ? "act" : undefined);
    return this.request("_co.grida/goal/start", {
      sessionId,
      inputId,
      prompt: [{ type: "text", text: objective }],
      ...(effort === "ultra" && { effort }),
      ...(regime && { operatingRegime: regime }),
      ...(allowWakeup && { allowWakeups: true }),
      ...(maxCostMills !== undefined && { maxCostMills }),
      goal: {
        objective: { description: objective, criteria },
        allowance: {
          work_turns: allowance.workTurns,
          inference_steps: allowance.inferenceSteps,
        },
        automatic,
        ...(namedChildId && { named_child: namedChildId }),
      },
    });
  }

  async inspect(
    sessionId: string,
    expectedRevision: number,
    completionAvailable = false,
    manualContinuationAvailable = false
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
    let reservation: NativeChatGoal["reservation"] = null;
    if (rawReservation) {
      const inferenceSteps = number(rawReservation.inference_steps, 1, MAX_U32);
      const uncertainSteps =
        rawReservation.uncertain_steps === null
          ? null
          : number(rawReservation.uncertain_steps, 0, inferenceSteps);
      const reviewInferenceSteps =
        rawReservation.child_inference_steps === undefined
          ? undefined
          : number(rawReservation.child_inference_steps, 1, inferenceSteps - 1);
      reservation = Object.freeze({
        turnId: identity(rawReservation.turn),
        inferenceSteps,
        ...(reviewInferenceSteps !== undefined && { reviewInferenceSteps }),
        uncertain: uncertainSteps !== null,
      });
    }
    const status = state(row.status);
    const paused = flag(row.paused);
    const continuationPending =
      manualContinuationAvailable && row.continuationPending === true;
    const progress =
      row.progress === null ? null : text(row.progress, PROGRESS_LIMIT);
    const completion =
      completionAvailable && row.review !== undefined
        ? completionReview(
            row.review,
            basis,
            status,
            paused,
            reservation,
            progress
          )
        : undefined;
    const goal: NativeChatGoal = Object.freeze({
      ...NativeAgentGoals.readStoredRequest(row),
      goalId: basis.goal,
      state: status,
      paused,
      progress,
      spent: usage(row.spent),
      remaining: usage(row.remaining),
      reservation,
      ...(continuationPending && { continuationPending: true as const }),
      ...(completion && { review: completion }),
      ...(row.spending !== undefined && { spending: spending(row.spending) }),
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
    change: NativeChatGoalControl,
    fundedReviewAvailable = false
  ): Promise<NativeChatGoalReceipt> {
    if (
      !this.issued.has(inspection) ||
      inspection.sessionId !== sessionId ||
      !inspection.basis
    )
      throw new Error("native_chat_goal_observation_unavailable");
    const requestId = identity(change.requestId);
    const action = member(change.action, [
      "pause",
      "resume",
      "clear",
      "revise",
      "confirm_completion",
      "reconcile_review",
    ] as const);
    const review = inspection.goal?.review;
    if (action === "confirm_completion" && review?.status !== "pending")
      throw new Error("native_chat_goal_completion_review_unavailable");
    const reservation = inspection.goal?.reservation;
    if (
      action === "reconcile_review" &&
      (!fundedReviewAvailable ||
        !reservation?.uncertain ||
        !reservation.reviewInferenceSteps)
    )
      throw new Error("native_chat_goal_review_account_unavailable");
    const reply = object(
      await this.request("_co.grida/goal/control", {
        sessionId,
        requestId,
        expectedSessionRevision: inspection.sessionRevision,
        expectedStateRevision: inspection.stateRevision,
        basis: inspection.basis,
        change: {
          action,
          ...(change.action === "revise" && { objective: change.objective }),
          ...(action === "confirm_completion" && { turn: review?.turnId }),
          ...(action === "reconcile_review" && { turn: reservation?.turnId }),
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

function completionReview(
  value: unknown,
  basis: NonNullable<NativeGoalInspection["basis"]>,
  state: NativeChatGoalStatus,
  paused: boolean,
  reservation: NativeChatGoal["reservation"],
  progress: string | null
) {
  const row = object(value);
  const candidate = object(row.candidate);
  const source = object(candidate.basis);
  const turn = identity(candidate.turn);
  const summary = text(candidate.summary, PROGRESS_LIMIT);
  const reviewStatus = member(row.status, ["pending", "confirmed"] as const);
  const sourceRevision = number(source.revision, 1);
  if (
    paused ||
    reservation ||
    identity(source.goal) !== basis.goal ||
    (reviewStatus === "pending"
      ? state.status !== "blocked" ||
        state.reason !== "unverified_completion" ||
        sourceRevision !== basis.revision
      : state.status !== "complete" ||
        sourceRevision !== basis.revision - 1 ||
        progress !== summary)
  )
    throw invalid();
  if (reviewStatus === "confirmed") identity(row.request);
  return Object.freeze({ status: reviewStatus, turnId: turn, summary });
}

function state(value: unknown): NativeChatGoalStatus {
  const row = object(value);
  return row.status === "blocked"
    ? Object.freeze({ status: "blocked", reason: member(row.reason, BLOCKERS) })
    : Object.freeze({ status: member(row.status, STATUSES) });
}

function amount(value: unknown, positive = false): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value) ||
    (positive && !/[1-9]/.test(value))
  )
    throw invalid();
  return value;
}

function spending(value: unknown): NonNullable<NativeChatGoal["spending"]> {
  const row = object(value);
  if (Object.keys(row).length !== 6) throw invalid();
  const maxCostMills = amount(row.maxCostMills, true);
  const perRequestMaxCostMills = amount(row.perRequestMaxCostMills, true);
  const chargedMills = amount(row.chargedMills);
  const heldMills = amount(row.heldMills);
  const remainingMills = amount(row.remainingMills);
  const scaled = (value: string): bigint => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole + fraction.padEnd(18, "0"));
  };
  if (
    scaled(chargedMills) + scaled(heldMills) + scaled(remainingMills) !==
      scaled(maxCostMills) ||
    scaled(perRequestMaxCostMills) > scaled(maxCostMills)
  )
    throw invalid();
  return Object.freeze({
    maxCostMills,
    perRequestMaxCostMills,
    chargedMills,
    heldMills,
    remainingMills,
    unsettledAttempts: number(row.unsettledAttempts),
  });
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
