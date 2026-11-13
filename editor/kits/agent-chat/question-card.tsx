/**
 * `@/kits/agent-chat` — the locked `question` (ask-user) tool's UI.
 *
 * Mental model: the agent **asks**. The host surface pins
 * {@link QuestionPrompt} above its composer while the run is paused on the
 * human; the transcript only shows a passive record of what was asked and
 * answered ({@link AnsweredQuestionSummary}).
 *
 * This file is a THIN VIEW. All form logic — per-question selections, write-ins,
 * per-question skip, the wizard step, answer-building, and validation — lives in
 * the React-free {@link QuestionSurvey} core (`question-survey.ts`), which is
 * unit-tested on its own. The component holds one survey in state and swaps it
 * for the next on each transition.
 */

"use client";

import { useId, useState } from "react";
import { getToolName } from "ai";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Checkbox } from "@app/ui/components/checkbox";
import { Label } from "@app/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@app/ui/components/radio-group";
import { Textarea } from "@app/ui/components/textarea";
import type { ToolCallEntry } from "@/lib/agent-chat/types";
import {
  parseQuestions,
  QuestionSurvey,
  type QuestionAnswerOutput,
} from "./question-survey";

export type { QuestionAnswerOutput };

// The locked tool name is the native agent's vocabulary, matched by literal
// like `tool-display.ts` matches `run_command`. The wire shape is
// `tool-<name>` (AI SDK UI parts).
const QUESTION_TOOL_NAME = "question";

/** True iff this tool part is the locked `question` tool. */
export function isQuestionEntry(entry: ToolCallEntry): boolean {
  return getToolName(entry) === QUESTION_TOOL_NAME;
}

function inputOf(entry: ToolCallEntry): unknown {
  return "input" in entry ? entry.input : undefined;
}

function optionCardClassName(selected: boolean, disabled: boolean) {
  return cn(
    "flex cursor-pointer items-start gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm font-normal transition-colors hover:bg-muted/50",
    selected &&
      "border-primary/60 bg-primary/10 text-primary hover:bg-primary/15",
    disabled && "cursor-default opacity-70"
  );
}

function optionDescriptionClassName(selected: boolean) {
  return cn("text-xs", selected ? "text-primary/80" : "text-muted-foreground");
}

export function QuestionPrompt({
  input,
  onSubmit,
  disabled,
}: {
  input: unknown;
  onSubmit: (survey: QuestionSurvey) => void | Promise<boolean>;
  disabled?: boolean;
}) {
  // Stable prefix for `aria-labelledby` ids tying each write-in to its question
  // text (the form gives screen readers no other accessible name).
  const labelId = useId();
  const [survey, setSurvey] = useState(() => QuestionSurvey.from(input));
  const [submitted, setSubmitted] = useState(false);

  if (survey.count === 0) return null;

  const busy = disabled || submitted;
  const qi = survey.multiStep ? survey.step : 0;
  const q = survey.questions[qi];
  if (!q) return null;
  const questionId = `${labelId}-q${qi}`;
  const hasOptions = (q.options?.length ?? 0) > 0;
  const writeIn = survey.writeInFor(qi);
  const writeInSelected = survey.isCustomSelected(qi);

  const finalize = (s: QuestionSurvey) => {
    if (busy) return;
    setSubmitted(true);
    const pending = onSubmit(s);
    if (pending)
      void pending.then(
        (accepted) => {
          if (!accepted) setSubmitted(false);
        },
        () => setSubmitted(false)
      );
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
    <div className="flex flex-col gap-4 rounded-lg border bg-background p-3 shadow-lg shadow-black/10">
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
            {q.options!.map((opt, oi) => {
              const selected = survey.pickedFor(qi)[0] === opt.label;
              return (
                <Label key={oi} className={optionCardClassName(selected, busy)}>
                  <RadioGroupItem value={opt.label} className="mt-0.5" />
                  <span className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.description && (
                      <span className={optionDescriptionClassName(selected)}>
                        {opt.description}
                      </span>
                    )}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        )}

        {hasOptions && q.multi_select && (
          <div
            role="group"
            aria-labelledby={questionId}
            className="flex flex-col gap-1.5"
          >
            {q.options!.map((opt, oi) => {
              const selected = survey.pickedFor(qi).includes(opt.label);
              return (
                <Label key={oi} className={optionCardClassName(selected, busy)}>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      setSurvey(survey.togglePick(qi, opt.label))
                    }
                    disabled={busy}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.description && (
                      <span className={optionDescriptionClassName(selected)}>
                        {opt.description}
                      </span>
                    )}
                  </span>
                </Label>
              );
            })}
          </div>
        )}

        <div className={optionCardClassName(writeInSelected, busy)}>
          <Checkbox
            checked={writeInSelected}
            onCheckedChange={(checked) =>
              setSurvey((current) =>
                checked === true
                  ? current.selectCustom(qi)
                  : current.clearCustom(qi)
              )
            }
            disabled={busy}
            className="mt-0.5"
          />
          <Textarea
            aria-labelledby={questionId}
            value={writeIn}
            onFocus={() => setSurvey((current) => current.selectCustom(qi))}
            onChange={(e) =>
              setSurvey((current) => current.setWriteIn(qi, e.target.value))
            }
            disabled={busy}
            rows={2}
            placeholder={
              hasOptions ? "Or write your own answer…" : "Type your answer…"
            }
            className="min-h-14 resize-y border-0 bg-transparent p-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {survey.multiStep && survey.step > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
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
          size="xs"
          onClick={onSkip}
          disabled={busy}
        >
          Skip
        </Button>
        {survey.multiStep && !survey.isLast ? (
          <Button
            type="button"
            size="xs"
            onClick={() => setSurvey(survey.next())}
            disabled={!survey.currentAnswered || busy}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            size="xs"
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
