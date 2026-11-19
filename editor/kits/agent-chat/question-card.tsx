/**
 * `@/kits/agent-chat` — the locked `question` (ask-user) tool's UI.
 *
 * A surface pins {@link QuestionPrompt} above its composer. An optional
 * question can return to a compact transcript action while work continues.
 *
 * This file is a THIN VIEW. All form logic — per-question selections, write-ins,
 * per-question skip, the wizard step, answer-building, and validation — lives in
 * the React-free {@link QuestionSurvey} core (`question-survey.ts`), which is
 * unit-tested on its own. The component holds one survey in state and swaps it
 * for the next on each transition.
 */

"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getToolName } from "ai";
import { MessageCircleQuestionIcon, XIcon } from "lucide-react";
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

export function isQuestionEntry(entry: ToolCallEntry): boolean {
  const name = getToolName(entry);
  return name === "question" || name === "question_async";
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
  submitDisabled,
  dismissal,
}: {
  input: unknown;
  onSubmit: (survey: QuestionSurvey) => void | Promise<boolean>;
  /** A refreshed review may be needed to submit while the draft stays editable. */
  submitDisabled?: boolean;
  /** Optional questions can move back into the transcript until their host expires them. */
  dismissal?: { transcript: Element | null; initiallyClosed?: boolean };
}) {
  // Stable prefix for `aria-labelledby` ids tying each write-in to its question
  // text (the form gives screen readers no other accessible name).
  const labelId = useId();
  const [survey, setSurvey] = useState(() => QuestionSurvey.from(input));
  const [submitted, setSubmitted] = useState(false);
  const [closed, setClosed] = useState(dismissal?.initiallyClosed ?? false);
  const form = useRef<HTMLDivElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (restoreFocus.current) {
      (closed ? reopen.current : form.current)?.focus();
      restoreFocus.current = false;
    }
  }, [closed]);

  if (survey.count === 0) return null;

  const busy = submitDisabled || submitted;
  const qi = survey.multiStep ? survey.step : 0;
  const q = survey.questions[qi];
  if (!q) return null;
  const questionId = `${labelId}-q${qi}`;
  const hasOptions = (q.options?.length ?? 0) > 0;
  const writeIn = survey.writeInFor(qi);
  const writeInSelected = survey.isCustomSelected(qi);
  const hasNext = survey.multiStep && !survey.isLast;
  const canAdvance =
    !busy && (hasNext ? survey.currentAnswered : survey.canSubmit);
  const changeClosed = (next: boolean) => {
    restoreFocus.current = true;
    setClosed(next);
  };

  if (closed && dismissal) {
    const action = (
      <div className="flex flex-col items-start gap-1.5">
        <p id={questionId} className="text-sm whitespace-pre-wrap">
          {q.question}
        </p>
        <Button
          ref={reopen}
          type="button"
          variant="outline"
          size="sm"
          aria-describedby={questionId}
          className="rounded-full"
          onClick={() => changeClosed(false)}
        >
          <MessageCircleQuestionIcon />
          Answer question
        </Button>
      </div>
    );
    return dismissal.transcript
      ? createPortal(action, dismissal.transcript)
      : action;
  }

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
  // Dismissing keeps the draft. A required question submits an explicit skip.
  const onSkip = () => {
    if (dismissal) return changeClosed(true);
    if (busy) return;
    const skipped = survey.skipCurrent();
    if (hasNext) setSurvey(skipped.next());
    else finalize(skipped);
  };
  const advance = () => {
    if (!canAdvance) return;
    if (hasNext) setSurvey(survey.next());
    else finalize(survey);
  };

  return (
    <div
      ref={form}
      tabIndex={-1}
      role="group"
      aria-labelledby={questionId}
      className="flex flex-col gap-4 rounded-lg border bg-background p-3 shadow-lg shadow-black/10 outline-none"
      onKeyDown={(event) => {
        if (event.key === "Escape" && dismissal && !submitted) {
          event.stopPropagation();
          changeClosed(true);
        }
      }}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageCircleQuestionIcon className="size-4" />
        Question
        {dismissal && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ms-auto"
            aria-label="Close question"
            disabled={submitted}
            onClick={() => changeClosed(true)}
          >
            <XIcon />
          </Button>
        )}
      </div>
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
            disabled={submitted}
            className="gap-1.5"
          >
            {q.options!.map((opt, oi) => {
              const selected = survey.pickedFor(qi)[0] === opt.label;
              return (
                <Label
                  key={oi}
                  className={optionCardClassName(selected, submitted)}
                >
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
                <Label
                  key={oi}
                  className={optionCardClassName(selected, submitted)}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      setSurvey(survey.togglePick(qi, opt.label))
                    }
                    disabled={submitted}
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

        <div className={optionCardClassName(writeInSelected, submitted)}>
          <Checkbox
            checked={writeInSelected}
            onCheckedChange={(checked) =>
              setSurvey((current) =>
                checked === true
                  ? current.selectCustom(qi)
                  : current.clearCustom(qi)
              )
            }
            disabled={submitted}
            className="mt-0.5"
          />
          <Textarea
            aria-labelledby={questionId}
            value={writeIn}
            onFocus={() => {
              if (!submitted) setSurvey((current) => current.selectCustom(qi));
            }}
            onChange={(e) =>
              setSurvey((current) => current.setWriteIn(qi, e.target.value))
            }
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) advance();
            }}
            readOnly={submitted}
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
          disabled={dismissal ? submitted : busy}
        >
          Skip
        </Button>
        <Button
          type="button"
          size="xs"
          onClick={advance}
          disabled={!canAdvance}
        >
          {hasNext ? "Next" : "Submit"}
        </Button>
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
