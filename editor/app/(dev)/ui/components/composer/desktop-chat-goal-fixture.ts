import type {
  NativeChatGoal,
  NativeChatGoalControl,
  NativeChatGoalObservation,
  NativeChatGoalReceipt,
  NativeChatGoalRequest,
  NativeChatTurn,
} from "@grida/desktop-bridge";

type TurnEffect = "pause" | "resume" | "clear" | "restart" | "continue";

const DEFAULT_ALLOWANCE = { workTurns: 8, inferenceSteps: 64 } as const;

/** One scripted Goal in a demo chat. The fixture's ordinary reply drives its work. */
export class DesktopChatGoalFixture {
  private goal: NativeChatGoal | null = null;
  private revision = 0;
  private lastControl?: {
    change: NativeChatGoalControl;
    receipt: NativeChatGoalReceipt;
  };

  constructor(private readonly sessionId: string) {}

  get canStart(): boolean {
    return (
      !this.goal ||
      (!this.goal.reservation &&
        (this.goal.state.status === "complete" ||
          this.goal.state.status === "cleared"))
    );
  }

  read(sessionRevision: number): NativeChatGoalObservation {
    return {
      observationId: this.goal ? this.observationId(sessionRevision) : null,
      goal: this.goal,
      goalRevision: this.revision,
    };
  }

  start(goalId: string, turnId: string, request: NativeChatGoalRequest): void {
    const { objective, criteria, automatic, effort } = request;
    const allowance = request.allowance ?? DEFAULT_ALLOWANCE;
    this.goal = {
      goalId,
      objective,
      criteria,
      automatic,
      effort,
      allowance,
      state: { status: "active" },
      paused: false,
      progress: null,
      spent: { workTurns: 0, inferenceSteps: 0 },
      remaining: allowance,
      reservation: null,
    };
    this.lastControl = undefined;
    this.reserve(turnId);
  }

  reserve(turnId: string): void {
    if (!this.goal) throw new Error("fixture_goal_unavailable");
    this.goal = {
      ...this.goal,
      reservation: { turnId, inferenceSteps: 1, uncertain: false },
    };
    this.revision++;
  }

  settle(turnId: string, status: NonNullable<NativeChatTurn["status"]>): void {
    const goal = this.goal;
    if (goal?.reservation?.turnId !== turnId) return;
    const spent = {
      workTurns: goal.spent.workTurns + 1,
      inferenceSteps: goal.spent.inferenceSteps + 1,
    };
    const remaining = {
      workTurns: goal.allowance.workTurns - spent.workTurns,
      inferenceSteps: goal.allowance.inferenceSteps - spent.inferenceSteps,
    };
    this.goal = {
      ...goal,
      reservation: null,
      spent,
      remaining,
      paused: false,
      ...(status === "succeeded"
        ? {
            state: { status: "complete" },
            progress: "The scripted work satisfied the goal.",
          }
        : {
            state:
              remaining.workTurns > 0 && remaining.inferenceSteps > 0
                ? { status: "blocked", reason: "no_progress" }
                : { status: "exhausted" },
          }),
    };
    this.revision++;
  }

  control(
    change: NativeChatGoalControl,
    sessionRevision: number,
    current: NativeChatTurn | null,
    apply: (effect: TurnEffect | null) => {
      sessionRevision: number;
      turnId: string | null;
    }
  ): NativeChatGoalReceipt {
    const prior = this.lastControl;
    if (prior?.change.requestId === change.requestId) {
      if (JSON.stringify(prior.change) !== JSON.stringify(change))
        throw new Error("fixture_goal_request_id_reused");
      return prior.receipt;
    }
    if (
      !this.goal ||
      change.observationId !== this.observationId(sessionRevision)
    )
      throw new Error("stale_session_revision");

    const goal = this.goal;
    const reserved = !!current && current.turnId === goal.reservation?.turnId;
    if (current && !reserved) throw new Error("fixture_goal_turn_unavailable");
    const hasAllowance =
      goal.remaining.workTurns > 0 && goal.remaining.inferenceSteps > 0;
    let effect: TurnEffect | null = null;
    switch (change.action) {
      case "pause":
        if (goal.state.status !== "active" || goal.paused)
          throw new Error("fixture_goal_pause_unavailable");
        this.goal = { ...goal, paused: true };
        effect = reserved ? "pause" : null;
        break;
      case "resume":
        if (
          (!goal.paused && goal.state.status !== "blocked") ||
          (reserved && !current.paused) ||
          !hasAllowance
        )
          throw new Error("fixture_goal_resume_unavailable");
        this.goal = { ...goal, paused: false, state: { status: "active" } };
        effect = reserved ? "resume" : "continue";
        break;
      case "clear":
        this.goal = {
          ...goal,
          paused: false,
          state: { status: "cleared" },
          reservation: null,
        };
        effect = reserved ? "clear" : null;
        break;
      case "revise":
        if (goal.state.status === "complete" || goal.state.status === "cleared")
          throw new Error("fixture_goal_control_unavailable");
        this.goal = {
          ...goal,
          objective: change.objective.description,
          criteria: change.objective.criteria,
          progress: null,
          reservation: null,
          state: hasAllowance ? { status: "active" } : { status: "exhausted" },
        };
        effect = reserved
          ? "restart"
          : hasAllowance && goal.automatic && !goal.paused
            ? "continue"
            : null;
        break;
      default:
        throw new Error("fixture_goal_control_unavailable");
    }
    this.revision++;
    const result = apply(effect);
    const receipt = {
      sessionId: this.sessionId,
      requestId: change.requestId,
      sessionRevision: result.sessionRevision,
      stateRevision: this.revision,
      turnId: result.turnId,
      journalPosition: result.turnId ? result.sessionRevision : null,
    };
    this.lastControl = { change, receipt };
    return receipt;
  }

  private observationId(sessionRevision: number): string {
    return `goal-${sessionRevision}-${this.revision}`;
  }
}
