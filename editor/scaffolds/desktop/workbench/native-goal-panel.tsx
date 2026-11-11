"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import type {
  NativeChatEffort,
  NativeChatGoal,
  NativeChatGoalObjective,
  NativeChatTurn,
} from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Textarea } from "@app/ui/components/textarea";
import { GoalSpending } from "@/lib/agent-chat/goal-spending";
import type {
  NativeChatController,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";
import type { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";

const BLOCKER = {
  needs_input: "Input required",
  capability_unavailable: "Required capability unavailable",
  no_progress: "No further progress",
  unverified_completion: "Completion unverified",
  uncertain_work: "Work outcome uncertain",
} as const;

type GoalRevisionDraft = NativeChatGoalObjective & {
  scope: number;
  goalId: string;
  goalRevision: number;
};

export function NativeGoalPanel({
  controller,
  view,
}: {
  controller: NativeChatController;
  view: NativeChatView;
}) {
  const [adding, setAdding] = useState(false);
  const [effort, setEffort] = useState<NativeChatEffort>("standard");
  const [editing, setEditing] = useState<GoalRevisionDraft | null>(null);
  const goal = view.goal?.goal;
  const goalRevision = view.goal?.goalRevision;
  const revisionDraft =
    editing?.scope === view.scope && editing.goalId === goal?.goalId
      ? editing
      : null;
  const review = goal?.review?.status === "pending" ? goal.review : null;
  const pending = view.observation?.snapshot.pendingGoalId;
  const goalTurn =
    !!goal?.reservation &&
    goal.reservation.turnId === view.observation?.snapshot.current?.turnId;
  const manualContinuation = controller.showsManualGoalContinuation;
  const retryManualConfirmation = controller.canRetryManualGoalConfirmation;
  const canManageWork =
    goalTurn ||
    goal?.automatic ||
    manualContinuation ||
    retryManualConfirmation;
  const fundedTurn = goalTurn && !!goal?.reservation?.reviewInferenceSteps;
  const canStart = controller.canStartGoal;
  const canAllowWakeup =
    view.wakeupsAvailable &&
    effort === "standard" &&
    view.operatingRegime === "act";
  const namedReviewers =
    effort === "ultra" &&
    view.operatingRegime === "act" &&
    view.observation?.snapshot.goalNamedChildAvailable
      ? view.subagents
      : null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const objective = readObjective(fields);
    const namedChildId = namedReviewers
      ? String(fields.get("namedChildId") ?? "")
      : "";
    void controller
      .startGoal(
        {
          objective: objective.description,
          criteria: objective.criteria,
          allowance: {
            workTurns: Number(fields.get("workTurns")),
            inferenceSteps: Number(fields.get("inferenceSteps")),
          },
          automatic: fields.has("automatic"),
          ...(effort === "ultra" && { effort }),
          ...(namedChildId && { namedChildId }),
          ...(canAllowWakeup &&
            fields.has("allowWakeup") && { allowWakeup: true }),
        },
        String(fields.get("maximumUsd") ?? "")
      )
      .then((accepted) => {
        if (accepted) setAdding(false);
      });
  };
  const revise = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!revisionDraft) return;
    const { scope, goalId, goalRevision } = revisionDraft;
    void controller
      .reviseGoal(
        { scope, goalId, goalRevision },
        readObjective(new FormData(event.currentTarget))
      )
      .then((accepted) => {
        if (accepted) setEditing(null);
      });
  };

  if (!goal && !adding && !canStart && !pending) return null;
  return (
    <section
      aria-label="Goal"
      data-testid="workspace-goal"
      className="max-h-[45vh] shrink-0 space-y-2 overflow-y-auto border-t px-3 py-2 text-xs"
    >
      {pending && <p role="status">Goal accepted · waiting to start</p>}
      {goal && !pending && (
        <>
          <div className="flex items-center justify-between gap-2">
            <strong>{goal.effort === "ultra" ? "Goal · Ultra" : "Goal"}</strong>
            <span role="status" className="text-muted-foreground">
              {goalStatus(goal, view.observation?.snapshot.current)}
            </span>
          </div>
          <p className="break-words">{goal.objective}</p>
          {goal.spending && (
            <p className="text-muted-foreground">
              Maximum spend {GoalSpending.usd(goal.spending.maxCostMills)} ·
              charged {GoalSpending.usd(goal.spending.chargedMills)} · held{" "}
              {GoalSpending.usd(goal.spending.heldMills)} · available{" "}
              {GoalSpending.usd(goal.spending.remainingMills)} · per request{" "}
              {GoalSpending.usd(goal.spending.perRequestMaxCostMills)}
              {goal.spending.unsettledAttempts > 0 &&
                ` · ${goal.spending.unsettledAttempts} unsettled attempts`}
            </p>
          )}
          {goal.progress && (
            <p className="break-words text-muted-foreground">{goal.progress}</p>
          )}
          {review && (
            <div className="space-y-1">
              <p className="text-muted-foreground" title={review.turnId}>
                {view.observation?.snapshot.latest?.turnId === review.turnId
                  ? "From the latest goal work"
                  : "From an earlier goal work turn"}
              </p>
              <p className="break-words">{review.summary}</p>
              <p className="text-muted-foreground">
                Check the result against the success criteria.
              </p>
              <ol className="list-decimal space-y-0.5 break-words pl-5">
                {goal.criteria.map((criterion, index) => (
                  <li key={index}>{criterion}</li>
                ))}
              </ol>
              <Button
                size="xs"
                type="button"
                disabled={!controller.canControlGoal("confirm_completion")}
                onClick={() =>
                  void controller.controlGoal("confirm_completion")
                }
              >
                Confirm goal complete
              </Button>
            </div>
          )}
          <details className="space-y-1 text-muted-foreground">
            <summary>{review ? "Allowance" : "Criteria and allowance"}</summary>
            {!review && (
              <ol className="list-decimal space-y-0.5 break-words pl-5">
                {goal.criteria.map((criterion, index) => (
                  <li key={index}>{criterion}</li>
                ))}
              </ol>
            )}
            <p>
              {goal.spent.workTurns} of {goal.allowance.workTurns} work turns
              used
            </p>
            <p>
              {goal.spent.inferenceSteps} of {goal.allowance.inferenceSteps}{" "}
              inference steps used
            </p>
            {goal.reservation && (
              <p>
                {goal.reservation.inferenceSteps} inference steps held for the
                reserved turn
                {goal.reservation.uncertain ? " · outcome uncertain" : ""}
              </p>
            )}
            {goal.reservation?.reviewInferenceSteps && (
              <p>
                {goal.reservation.reviewInferenceSteps} of the held steps are
                reserved for independent review.
              </p>
            )}
            {goal.namedChildId && view.subagents && (
              <GoalReviewerName
                controller={view.subagents}
                childId={goal.namedChildId}
              />
            )}
            <p>
              {goal.remaining.workTurns} work turns and{" "}
              {goal.remaining.inferenceSteps} inference steps unreserved
            </p>
            <p>
              {goal.automatic
                ? "Automatic continuation on"
                : "Automatic continuation off"}
            </p>
          </details>
          {fundedTurn && (
            <p className="text-muted-foreground">
              Use the task’s Pause, Resume, or Stop controls for this funded
              turn.
            </p>
          )}
          {goal.continuationPending && (
            <p className="text-muted-foreground" role="status">
              Next goal turn queued.
            </p>
          )}
          {!fundedTurn && goal.state.status !== "cleared" && (
            <div className="flex flex-wrap gap-1">
              {goalRevision !== undefined &&
                goal.state.status !== "complete" &&
                !revisionDraft && (
                  <Button
                    size="xs"
                    variant="ghost"
                    type="button"
                    disabled={!controller.canControlGoal("revise")}
                    onClick={() =>
                      setEditing({
                        scope: view.scope,
                        goalId: goal.goalId,
                        goalRevision,
                        description: goal.objective,
                        criteria: goal.criteria,
                      })
                    }
                  >
                    Edit goal
                  </Button>
                )}
              {canManageWork &&
              (manualContinuation ||
                retryManualConfirmation ||
                goal.paused ||
                goal.state.status === "blocked") ? (
                <Button
                  size="xs"
                  variant="ghost"
                  type="button"
                  disabled={!controller.canControlGoal("resume")}
                  onClick={() => void controller.controlGoal("resume")}
                >
                  {retryManualConfirmation
                    ? "Retry confirmation"
                    : manualContinuation &&
                        !goal.paused &&
                        goal.state.status === "active"
                      ? "Continue goal"
                      : "Resume goal"}
                </Button>
              ) : canManageWork && goal.state.status === "active" ? (
                <Button
                  size="xs"
                  variant="ghost"
                  type="button"
                  disabled={!controller.canControlGoal("pause")}
                  onClick={() => void controller.controlGoal("pause")}
                >
                  Pause goal
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="ghost"
                type="button"
                disabled={!controller.canControlGoal("clear")}
                onClick={() => void controller.controlGoal("clear")}
              >
                Clear goal
              </Button>
            </div>
          )}
          {controller.canControlGoal("reconcile_review") && (
            <Button
              size="xs"
              type="button"
              variant="outline"
              onClick={() => void controller.controlGoal("reconcile_review")}
            >
              Refresh held allowance
            </Button>
          )}
        </>
      )}
      {revisionDraft && (
        <form className="space-y-2" onSubmit={revise} aria-label="Edit goal">
          <GoalObjectiveFields disabled={view.acting} initial={revisionDraft} />
          {goalTurn && (
            <p className="text-muted-foreground">
              Saving stops the current goal turn. Its work still counts toward
              the allowance.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="xs"
              variant="ghost"
              type="button"
              disabled={view.acting}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              type="submit"
              disabled={!controller.canControlGoal("revise")}
            >
              Save goal
            </Button>
          </div>
        </form>
      )}
      {adding ? (
        <form className="space-y-2" onSubmit={submit}>
          <p className="text-muted-foreground">
            {view.operatingRegime === "plan" ? "Plan goal" : "Act goal"}
          </p>
          <GoalObjectiveFields disabled={view.acting} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span>Work turns</span>
              <Input
                name="workTurns"
                type="number"
                min={1}
                max={0xffffffff}
                step={1}
                required
                disabled={view.acting}
              />
            </label>
            <label className="block space-y-1">
              <span>Inference steps</span>
              <Input
                name="inferenceSteps"
                type="number"
                min={1}
                max={0xffffffff}
                step={1}
                required
                disabled={view.acting}
              />
            </label>
          </div>
          {view.observation?.snapshot.goalSpendingAvailable && (
            <label className="block space-y-1">
              <span>Maximum spend (USD, optional)</span>
              <Input
                name="maximumUsd"
                inputMode="decimal"
                maxLength={64}
                placeholder="For example, 1.00"
                disabled={view.acting}
              />
              <span className="text-muted-foreground">
                Provider-enforced total for this goal, including subagents.
                Uncertain work keeps its hold.
              </span>
            </label>
          )}
          {(view.goalEffortAvailable || effort === "ultra") && (
            <label className="flex items-center gap-2">
              Effort for this goal
              <select
                name="effort"
                className="rounded border bg-background px-1 py-0.5"
                value={effort}
                disabled={view.acting}
                onChange={(event) =>
                  setEffort(
                    event.currentTarget.value === "ultra" ? "ultra" : "standard"
                  )
                }
              >
                <option value="standard">Standard</option>
                <option value="ultra" disabled={!view.goalEffortAvailable}>
                  Ultra
                </option>
              </select>
            </label>
          )}
          {namedReviewers && (
            <GoalReviewerField
              controller={namedReviewers}
              disabled={view.acting}
            />
          )}
          <label className="flex items-center gap-2">
            <input name="automatic" type="checkbox" disabled={view.acting} />
            Continue automatically within these limits
          </label>
          {canAllowWakeup && (
            <label className="flex items-center gap-2">
              <input
                name="allowWakeup"
                type="checkbox"
                disabled={view.acting}
              />
              Allow one check-in during the first goal turn
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="xs"
              variant="ghost"
              type="button"
              disabled={view.acting}
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
            <Button size="xs" type="submit" disabled={!canStart}>
              Start goal
            </Button>
          </div>
        </form>
      ) : canStart ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => {
            setEffort("standard");
            setAdding(true);
          }}
        >
          Add goal
        </Button>
      ) : null}
    </section>
  );
}

function readObjective(fields: FormData): NativeChatGoalObjective {
  return {
    description: String(fields.get("objective") ?? "").trim(),
    criteria: String(fields.get("criteria") ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

function GoalObjectiveFields({
  disabled,
  initial,
}: {
  disabled: boolean;
  initial?: NativeChatGoalObjective;
}) {
  return (
    <>
      <label className="block space-y-1">
        <span>Objective</span>
        <Textarea
          name="objective"
          required
          rows={2}
          disabled={disabled}
          defaultValue={initial?.description}
        />
      </label>
      <label className="block space-y-1">
        <span>Success criteria, one per line</span>
        <Textarea
          name="criteria"
          required
          rows={2}
          disabled={disabled}
          defaultValue={initial?.criteria.join("\n")}
        />
      </label>
    </>
  );
}

function GoalReviewerField({
  controller,
  disabled,
}: {
  controller: NativeSubagentController;
  disabled: boolean;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2">
        Goal reviewer
        <select
          name="namedChildId"
          className="min-w-0 rounded border bg-background px-1 py-0.5"
          disabled={disabled}
        >
          <option value="">Independent reviewer</option>
          {state.children.map(({ childId, name }) => (
            <option key={childId} value={childId}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {!state.open && (!state.children.length || state.next) && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={disabled}
          onClick={() => controller.toggle()}
        >
          Show named subagents
        </Button>
      )}
      {state.open && state.next && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={disabled || state.listing}
          onClick={() => void controller.list(true)}
        >
          Load more reviewers
        </Button>
      )}
    </div>
  );
}

function GoalReviewerName({
  controller,
  childId,
}: {
  controller: NativeSubagentController;
  childId: string;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const name = state.children.find((child) => child.childId === childId)?.name;
  return <p>{name ? `Reviewer · ${name}` : "Reviewer · Named subagent"}</p>;
}

function goalStatus(
  goal: NativeChatGoal,
  turn: NativeChatTurn | null | undefined
): string {
  switch (goal.state.status) {
    case "blocked":
      return goal.review?.status === "pending"
        ? "Ready for your review"
        : `Blocked · ${BLOCKER[goal.state.reason]}`;
    case "exhausted":
      return "Allowance exhausted";
    case "complete":
      return goal.review?.status === "confirmed"
        ? "Completed · confirmed by you"
        : "Completed";
    case "cleared":
      return "Cleared";
    case "active":
      if (!goal.reservation) return goal.paused ? "Paused" : "Active";
      if (goal.reservation.uncertain) return "Work outcome uncertain";
      if (!turn || turn.turnId !== goal.reservation.turnId)
        return "Work reserved";
      if (turn.cancelled) return "Stopping goal work";
      if (turn.disposition === "interrupted") return "Work interrupted";
      if (goal.paused || turn.paused)
        return turn.disposition === "running" ? "Pausing goal work" : "Paused";
      return turn.disposition === "suspended"
        ? "Goal waiting for input"
        : "Working toward goal";
  }
}
