/**
 * `@/kits/agent-chat` — the locked `question` (ask-user) tool's UI.
 *
 * Mental model: the agent **asks**. This is NOT a tool card buried in the
 * transcript — it is a SESSION-GLOBAL prompt the host surface pins above its
 * composer (exactly like the supervised-approval bar). The run is paused on the
 * human; {@link findPendingQuestion} finds the one open question for the
 * session, the surface mounts {@link QuestionCard} above the composer, and the
 * committed answer leaves through `onAnswer` — the surface owns the `Chat` and
 * calls `chat.addToolResult({ tool: "question", toolCallId, output })`. The
 * transcript only shows a passive record of what was asked/answered.
 *
 * This file is a THIN VIEW. All form logic — per-question selections, write-ins,
 * per-question skip, the wizard step, answer-building, and validation — lives in
 * the React-free {@link QuestionSurvey} core (`question-survey.ts`), which is
 * unit-tested on its own. The component holds one survey in state and swaps it
 * for the next on each transition.
 */

"use client";

import { useId, useRef, useState } from "react";
import { getToolName } from "ai";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Checkbox } from "@app/ui/components/checkbox";
import { Label } from "@app/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@app/ui/components/radio-group";
import { Textarea } from "@app/ui/components/textarea";
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat";
import {
  parseQuestions,
  QuestionSurvey,
  type QuestionAnswerOutput,
} from "./question-survey";

export type { QuestionAnswerOutput };

/**
 * Commit an answer to the open `question`. The surface wires this to
 * `chat.addToolResult`, so the human's answer becomes the tool result and the
 * paused run resumes.
 */
export type AnswerQuestionHandler = (
  toolCallId: string,
  output: QuestionAnswerOutput
) => void;

// The locked tool name is producer-owned vocabulary (`@grida/agent`'s
// `QUESTION_TOOL_NAME`). It is mirrored here as a one-char-cheap string rather
// than imported so this render-only kit needn't pull the package's neutral
// runtime entrypoint for a constant — the same reason `tool-display.ts` matches
// `run_command` by literal. The wire shape is `tool-<name>` (AI SDK UI parts).
export const QUESTION_TOOL_NAME = "question";
const QUESTION_PART_TYPE = `tool-${QUESTION_TOOL_NAME}`;

/** True iff this tool part is the locked `question` tool. */
export function isQuestionEntry(entry: ToolCallEntry): boolean {
  return getToolName(entry) === QUESTION_TOOL_NAME;
}

/** Tolerate the AI SDK's `toolCallId` (live stream) vs the persisted
 *  `tool_call_id` (rehydrated from the DB on reload). */
function toolCallIdOf(entry: ToolCallEntry): string {
  const e = entry as { toolCallId?: string; tool_call_id?: string };
  return e.toolCallId ?? e.tool_call_id ?? "";
}

function inputOf(entry: ToolCallEntry): unknown {
  return "input" in entry ? entry.input : undefined;
}

/**
 * The session's ONE open question, or null. A `question` call pauses the run,
 * so it lives on the last assistant message at `input-available` (the same
 * shape rule as the approval bar's `findPendingApproval`). The surface renders
 * {@link QuestionCard} for it above the composer. Tolerates camelCase (live)
 * and snake_case (rehydrated) part shapes.
 */
export function findPendingQuestion(
  messages: ChatMessage[]
): ToolCallEntry | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  for (const part of last.parts) {
    const p = part as {
      type?: string;
      state?: string;
      toolCallId?: string;
      tool_call_id?: string;
    };
    const toolCallId = p.toolCallId ?? p.tool_call_id;
    if (
      p.type === QUESTION_PART_TYPE &&
      p.state === "input-available" &&
      toolCallId
    ) {
      return part as ToolCallEntry;
    }
  }
  return null;
}

/**
 * The interactive survey form — a thin view over {@link QuestionSurvey}. Rendered
 * while the `question` part is `input-available` (the run is paused on the user).
 * On submit/skip it calls `onAnswer(toolCallId, output)`; the host wires that to
 * `addToolResult`.
 */
export function QuestionCard({
  entry,
  onAnswer,
  disabled,
}: {
  entry: ToolCallEntry;
  onAnswer: AnswerQuestionHandler;
  disabled?: boolean;
}) {
  // Stable prefix for `aria-labelledby` ids tying each write-in to its question
  // text (the form gives screen readers no other accessible name).
  const labelId = useId();
  const [survey, setSurvey] = useState(() =>
    QuestionSurvey.from(inputOf(entry))
  );
  const [submitted, setSubmitted] = useState(false);

  // Reset when the pending tool call changes — a surface may reuse this instance
  // for a NEW question without unmounting (two questions back-to-back in one
  // turn). React's guarded "adjust state during render" pattern.
  const toolCallId = toolCallIdOf(entry);
  const seenToolCallId = useRef(toolCallId);
  if (seenToolCallId.current !== toolCallId) {
    seenToolCallId.current = toolCallId;
    setSurvey(QuestionSurvey.from(inputOf(entry)));
    setSubmitted(false);
  }

  if (survey.count === 0) return null;

  const busy = disabled || submitted;
  const qi = survey.multiStep ? survey.step : 0;
  const q = survey.questions[qi];
  if (!q) return null;
  const questionId = `${labelId}-q${qi}`;
  const hasOptions = (q.options?.length ?? 0) > 0;
  const writeIn = survey.writeInFor(qi);

  const finalize = (s: QuestionSurvey) => {
    if (busy) return;
    setSubmitted(true);
    onAnswer(toolCallId, s.buildOutput());
  };
  // Skip is PER QUESTION: skip the current one (its answer becomes empty) and
  // advance, or finalize if it's the last/only question.
  const onSkip = () => {
    if (busy) return;
    const skipped = survey.skipCurrent();
    if (survey.multiStep && !survey.isLast) setSurvey(skipped.next());
    else finalize(skipped);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {(q.header || survey.multiStep) && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {q.header}
            </span>
            {survey.multiStep && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                Question {survey.step + 1} of {survey.count}
              </span>
            )}
          </div>
        )}
        <p id={questionId} className="text-sm font-medium">
          {q.question}
        </p>

        {hasOptions && !q.multi_select && (
          <RadioGroup
            aria-labelledby={questionId}
            value={survey.pickedFor(qi)[0] ?? ""}
            onValueChange={(label) => setSurvey(survey.togglePick(qi, label))}
            disabled={busy}
            className="gap-1.5"
          >
            {q.options!.map((opt, oi) => (
              <Label
                key={oi}
                className="flex cursor-pointer items-start gap-2 text-sm font-normal"
              >
                <RadioGroupItem value={opt.label} className="mt-0.5" />
                <span className="flex flex-col">
                  <span>{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </span>
              </Label>
            ))}
          </RadioGroup>
        )}

        {hasOptions && q.multi_select && (
          <div
            role="group"
            aria-labelledby={questionId}
            className="flex flex-col gap-1.5"
          >
            {q.options!.map((opt, oi) => (
              <Label
                key={oi}
                className="flex cursor-pointer items-start gap-2 text-sm font-normal"
              >
                <Checkbox
                  checked={survey.pickedFor(qi).includes(opt.label)}
                  onCheckedChange={() =>
                    setSurvey(survey.togglePick(qi, opt.label))
                  }
                  disabled={busy}
                  className="mt-0.5"
                />
                <span className="flex flex-col">
                  <span>{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </span>
              </Label>
            ))}
          </div>
        )}

        <Textarea
          aria-labelledby={questionId}
          value={writeIn}
          onFocus={() => setSurvey(survey.selectCustom(qi))}
          onChange={(e) => setSurvey(survey.setWriteIn(qi, e.target.value))}
          disabled={busy}
          rows={2}
          placeholder={
            hasOptions ? "Or write your own answer…" : "Type your answer…"
          }
          // Highlight the custom field while it holds the answer (its options are
          // cleared), so "custom is selected" reads visually.
          className={cn(
            "text-sm",
            writeIn.trim().length > 0 && "ring-1 ring-ring"
          )}
        />
      </div>

      <div className="flex items-center gap-2">
        {survey.multiStep && survey.step > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSurvey(survey.back())}
            disabled={busy}
          >
            Back
          </Button>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={busy}
        >
          Skip
        </Button>
        {survey.multiStep && !survey.isLast ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setSurvey(survey.next())}
            disabled={!survey.currentAnswered || busy}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => finalize(survey)}
            disabled={!survey.canSubmit || busy}
          >
            Submit
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only echo of an answered survey — rendered once the `question` part is
 * terminal (`output-available`), so the transcript shows what was asked and how
 * the user answered. Per-question: an answered question shows its answer; a
 * skipped one shows "Skipped". The `skipped` sentinel (the user declined the
 * WHOLE survey) shows a single line.
 */
export function AnsweredQuestionSummary({ entry }: { entry: ToolCallEntry }) {
  const questions = parseQuestions(inputOf(entry));
  const output = ("output" in entry ? entry.output : undefined) as
    | QuestionAnswerOutput
    | undefined;
  if (questions.length === 0) return null;

  if (output?.skipped) {
    return (
      <div className="mt-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        You skipped this.
      </div>
    );
  }

  const answers = output?.answers ?? [];
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
      {questions.map((q, qi) => {
        const a = answers[qi] ?? [];
        return (
          <div key={qi} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{q.question}</span>
            <span
              className={cn(
                "text-sm font-medium",
                a.length === 0 && "text-muted-foreground italic"
              )}
            >
              {a.length ? a.join(", ") : "Skipped"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
