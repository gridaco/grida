"use client";

import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Textarea } from "@app/ui/components/textarea";
import type { NativeSubagentWork } from "@grida/desktop-bridge";
import { useSyncExternalStore } from "react";
import type { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";

export function NativeSubagentsPanel({
  controller,
}: {
  controller: NativeSubagentController;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const child = state.observation?.child;
  const assignment = child?.assignment;
  return (
    <section
      className="shrink-0 border-t px-3 py-2"
      data-testid="native-subagents"
    >
      <Button
        type="button"
        size="xs"
        variant="ghost"
        aria-expanded={state.open}
        disabled={state.acting}
        onClick={() => controller.toggle()}
      >
        Subagents
      </Button>
      {state.open && state.error && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={state.acting || state.listing}
          onClick={() => void controller.list()}
        >
          Refresh
        </Button>
      )}
      {state.open && (
        <div className="max-h-[min(22rem,45vh)] space-y-2 overflow-y-auto py-1 text-xs">
          {state.error && (
            <p role="alert" className="text-destructive">
              {state.error}
            </p>
          )}
          <form
            aria-label="Create a named subagent"
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void controller
                .create(
                  String(data.get("name") ?? ""),
                  Number(data.get("allowance"))
                )
                .then((created) => {
                  if (created) form.reset();
                });
            }}
          >
            <Input
              aria-label="Subagent name"
              name="name"
              required
              maxLength={128}
              placeholder="Name"
              className="h-7 min-w-0 text-xs"
              disabled={state.acting || state.listing}
            />
            <select
              aria-label="Assignment allowance"
              name="allowance"
              className="h-7 rounded border bg-background px-1.5"
              defaultValue="2"
              disabled={state.acting || state.listing}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                <option value={value} key={value}>
                  {value} {value === 1 ? "assignment" : "assignments"}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              size="xs"
              variant="outline"
              disabled={state.acting || state.listing}
            >
              Create
            </Button>
          </form>
          {state.children.length > 0 && (
            <div className="flex items-center gap-1">
              <select
                aria-label="Named subagent"
                className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1"
                value={state.selected ?? ""}
                disabled={state.acting}
                onChange={(event) =>
                  void controller.select(event.currentTarget.value)
                }
              >
                {state.children.map(({ childId, name }) => (
                  <option key={childId} value={childId}>
                    {name}
                  </option>
                ))}
              </select>
              {state.next && (
                <Button
                  size="xs"
                  type="button"
                  variant="ghost"
                  disabled={state.acting || state.listing}
                  onClick={() => void controller.list(true)}
                >
                  Load more
                </Button>
              )}
            </div>
          )}
          {state.listing && <p role="status">Loading subagents…</p>}
          {child && (
            <>
              <p className="text-muted-foreground">
                {child.reserved} of {child.workTurns} assignments used
                {child.admissionPaused && " · Queue held"}
              </p>
              {(child.queuedInputIds.length > 0 || state.input) && (
                <select
                  aria-label="Subagent assignment"
                  className="w-full rounded border bg-background px-2 py-1"
                  value={state.input ?? ""}
                  disabled={state.acting}
                  onChange={(event) =>
                    void controller.select(
                      child.childId,
                      event.currentTarget.value || null
                    )
                  }
                >
                  <option value="">Current or latest assignment</option>
                  {state.input &&
                    !child.queuedInputIds.includes(state.input) && (
                      <option value={state.input}>Selected assignment</option>
                    )}
                  {child.queuedInputIds.map((input, index) => (
                    <option value={input} key={input}>
                      Queued assignment {index + 1}
                    </option>
                  ))}
                </select>
              )}
              {assignment && (
                <div className="space-y-1 rounded border p-2">
                  <p className="font-medium">{assignmentState(assignment)}</p>
                  <p className="wrap-anywhere whitespace-pre-wrap">
                    {assignment.instructionPreview}
                    {assignment.instructionTruncated && "…"}
                  </p>
                  {assignment.result && (
                    <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">
                      {assignment.result.text}
                      {assignment.result.textTruncated && "…"}
                    </p>
                  )}
                  {state.observation?.stopObservationId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={state.acting}
                      onClick={() => void controller.stop()}
                    >
                      Stop subagent
                    </Button>
                  )}
                </div>
              )}
              <form
                key={child.childId}
                aria-label="Assign work to the selected subagent"
                className="grid gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const text = new FormData(form).get("instructions");
                  if (typeof text === "string")
                    void controller.assign(text).then((accepted) => {
                      if (accepted) form.reset();
                    });
                }}
              >
                <Textarea
                  aria-label="Assignment instructions"
                  name="instructions"
                  required
                  placeholder="What should this subagent do?"
                  className="min-h-14 resize-y text-xs"
                  readOnly={state.acting}
                />
                <Button
                  className="justify-self-end"
                  type="submit"
                  size="xs"
                  variant="outline"
                  disabled={state.acting || !controller.canAssign}
                >
                  Assign work
                </Button>
              </form>
              {!controller.canAssign && (
                <p className="text-muted-foreground">
                  Assignments need a finished Act turn and remaining allowance.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function assignmentState(work: NativeSubagentWork): string {
  switch (work.result?.status) {
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Stopped";
    case "uncertain":
      return "Result uncertain";
  }
  if (work.turn?.paused) return "Paused";
  if (work.turn?.cancelled) return "Stopping…";
  if (work.turn?.disposition === "interrupted") return "Interrupted";
  if (work.turn)
    return work.turn.disposition === "suspended" ? "Waiting" : "Working…";
  return work.disposition === "withdrawn" ? "Withdrawn" : "Queued";
}
