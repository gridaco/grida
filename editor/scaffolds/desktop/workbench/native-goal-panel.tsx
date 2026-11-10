"use client";

import { useState, type FormEvent } from "react";
import type { NativeChatGoal, NativeChatTurn } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Textarea } from "@app/ui/components/textarea";
import type {
  NativeChatController,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";

const BLOCKER = {
  needs_input: "Input required",
  capability_unavailable: "Required capability unavailable",
  no_progress: "No further progress",
  unverified_completion: "Completion unverified",
  uncertain_work: "Work outcome uncertain",
} as const;

export function NativeGoalPanel({
  controller,
  view,
}: {
  controller: NativeChatController;
  view: NativeChatView;
}) {
  const [adding, setAdding] = useState(false);
  const goal = view.goal?.goal;
  const pending = view.observation?.snapshot.pendingGoalId;
  const goalTurn =
    !!goal?.reservation &&
    goal.reservation.turnId === view.observation?.snapshot.current?.turnId;
  const canManageWork = goalTurn || goal?.automatic;
  const canStart = controller.canStartGoal;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void controller
      .startGoal({
        objective: String(fields.get("objective") ?? "").trim(),
        criteria: String(fields.get("criteria") ?? "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        allowance: {
          workTurns: Number(fields.get("workTurns")),
          inferenceSteps: Number(fields.get("inferenceSteps")),
        },
        automatic: fields.has("automatic"),
      })
      .then((accepted) => {
        if (accepted) setAdding(false);
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
            <strong>Goal</strong>
            <span role="status" className="text-muted-foreground">
              {goalStatus(goal, view.observation?.snapshot.current)}
            </span>
          </div>
          <p className="break-words">{goal.objective}</p>
          {goal.progress && (
            <p className="break-words text-muted-foreground">{goal.progress}</p>
          )}
          <details className="space-y-1 text-muted-foreground">
            <summary>Criteria and allowance</summary>
            <ol className="list-decimal space-y-0.5 break-words pl-5">
              {goal.criteria.map((criterion, index) => (
                <li key={index}>{criterion}</li>
              ))}
            </ol>
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
          {goal.state.status !== "cleared" && (
            <div className="flex flex-wrap gap-1">
              {canManageWork &&
              (goal.paused || goal.state.status === "blocked") ? (
                <Button
                  size="xs"
                  variant="ghost"
                  type="button"
                  disabled={!controller.canControlGoal("resume")}
                  onClick={() => void controller.controlGoal("resume")}
                >
                  Resume goal
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
        </>
      )}
      {adding ? (
        <form className="space-y-2" onSubmit={submit}>
          <label className="block space-y-1">
            <span>Objective</span>
            <Textarea
              name="objective"
              required
              rows={2}
              disabled={view.acting}
            />
          </label>
          <label className="block space-y-1">
            <span>Success criteria, one per line</span>
            <Textarea
              name="criteria"
              required
              rows={2}
              disabled={view.acting}
            />
          </label>
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
          <label className="flex items-center gap-2">
            <input name="automatic" type="checkbox" disabled={view.acting} />
            Continue automatically within these limits
          </label>
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
          onClick={() => setAdding(true)}
        >
          Add goal
        </Button>
      ) : null}
    </section>
  );
}

function goalStatus(
  goal: NativeChatGoal,
  turn: NativeChatTurn | null | undefined
): string {
  switch (goal.state.status) {
    case "blocked":
      return `Blocked · ${BLOCKER[goal.state.reason]}`;
    case "exhausted":
      return "Allowance exhausted";
    case "complete":
      return "Completed";
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
