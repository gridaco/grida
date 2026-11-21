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

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { getToolName } from "ai";
import { MessageCircleQuestionIcon, PencilIcon, XIcon } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Checkbox } from "@app/ui/components/checkbox";
import { Label } from "@app/ui/components/label";
import { Textarea } from "@app/ui/components/textarea";
import type { ToolCallEntry } from "@/lib/agent-chat/types";
import { AgentPromptCard } from "./prompt-card";
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

const questionTextClassName = "text-sm leading-5 font-normal";

function optionRowClassName(selected: boolean, disabled: boolean) {
  return cn(
    "flex min-h-8 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors",
    questionTextClassName,
    selected && "bg-accent text-accent-foreground",
    disabled ? "cursor-default opacity-70" : "hover:bg-accent/70"
  );
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
  const writeInInput = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (restoreFocus.current) {
      (closed ? reopen.current : form.current)?.focus();
      restoreFocus.current = false;
    }
  }, [closed, survey.step]);

  if (survey.count === 0) return null;

  const busy = submitDisabled || submitted;
  const qi = survey.multiStep ? survey.step : 0;
  const q = survey.questions[qi];
  if (!q) return null;
  const questionId = `${labelId}-q${qi}`;
  const options = q.options ?? [];
  const hasOptions = options.length > 0;
  const writeIn = survey.writeInFor(qi);
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
  const showStep = (next: QuestionSurvey) => {
    restoreFocus.current = true;
    setSurvey(next);
  };
  // Dismissing keeps the draft. A required question submits an explicit skip.
  const onSkip = () => {
    if (dismissal) return changeClosed(true);
    if (busy) return;
    const skipped = survey.skipCurrent();
    if (hasNext) showStep(skipped.next());
    else finalize(skipped);
  };
  const advance = () => {
    if (!canAdvance) return;
    if (hasNext) showStep(survey.next());
    else finalize(survey);
  };
  // Radix prevents Enter on radio items, so handle submission in capture.
  const handleChoiceKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key, target } = event;
    if (
      submitted ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229 ||
      !(target instanceof Element) ||
      target.closest("input, textarea, select, [contenteditable]")
    ) {
      return;
    }

    if (
      key === "Enter" &&
      target.closest('[role="radio"], [role="checkbox"]')
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) advance();
      return;
    }

    if (q.multi_select || !/^[1-9]$/.test(key)) return;
    const option =
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[
        Number(key) - 1
      ];
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) {
      option.focus();
      option.click();
    }
  };

  return (
    <AgentPromptCard
      ref={form}
      tabIndex={-1}
      role="group"
      aria-labelledby={questionId}
      data-question-prompt=""
      className={cn(
        "outline-none",
        hasOptions
          ? "min-h-36 grid-rows-[auto_minmax(0,auto)_minmax(2.5rem,1fr)_auto]"
          : "grid-rows-[auto_minmax(0,auto)_auto]"
      )}
      onKeyDownCapture={handleChoiceKey}
      onKeyDown={(event) => {
        if (event.key === "Escape" && dismissal && !submitted) {
          event.stopPropagation();
          changeClosed(true);
        }
      }}
    >
      <div className="flex min-h-6 items-center gap-2 px-2 text-muted-foreground">
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
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2">
        {(q.header || survey.multiStep) && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{q.header}</span>
            {survey.multiStep && (
              <span className="shrink-0 text-muted-foreground tabular-nums">
                Question {survey.step + 1} of {survey.count}
              </span>
            )}
          </div>
        )}
        <p id={questionId} className="wrap-anywhere">
          {q.question}
        </p>
      </div>

      {hasOptions && (
        <div className="-m-1 min-h-0 overflow-y-auto p-1">
          {!q.multi_select ? (
            <RadioGroup.Root
              aria-labelledby={questionId}
              value={survey.pickedFor(qi)[0] ?? ""}
              onValueChange={(label) => setSurvey(survey.togglePick(qi, label))}
              disabled={submitted}
              className="grid gap-0.5"
            >
              {options.map((opt, oi) => {
                const selected = survey.pickedFor(qi)[0] === opt.label;
                return (
                  <RadioGroup.Item
                    key={oi}
                    value={opt.label}
                    aria-keyshortcuts={oi < 9 ? String(oi + 1) : undefined}
                    className={cn(
                      "w-full text-start outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      optionRowClassName(selected, submitted)
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid h-5 min-w-5 shrink-0 place-items-center rounded-sm border bg-muted px-1 leading-none text-muted-foreground tabular-nums",
                        selected &&
                          "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {oi + 1}
                    </span>
                    <span className="flex min-w-0 flex-col wrap-anywhere">
                      <span>{opt.label}</span>
                      {opt.description && (
                        <span className="text-muted-foreground">
                          {opt.description}
                        </span>
                      )}
                    </span>
                  </RadioGroup.Item>
                );
              })}
            </RadioGroup.Root>
          ) : (
            <div
              role="group"
              aria-labelledby={questionId}
              className="flex flex-col gap-0.5"
            >
              {options.map((opt, oi) => {
                const selected = survey.pickedFor(qi).includes(opt.label);
                return (
                  <Label
                    key={oi}
                    className={optionRowClassName(selected, submitted)}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() =>
                        setSurvey(survey.togglePick(qi, opt.label))
                      }
                      disabled={submitted}
                      className="mt-0.5"
                    />
                    <span className="flex min-w-0 flex-col wrap-anywhere">
                      <span>{opt.label}</span>
                      {opt.description && (
                        <span className="text-muted-foreground">
                          {opt.description}
                        </span>
                      )}
                    </span>
                  </Label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg pe-1 ring-1 ring-transparent ring-inset transition-colors hover:bg-muted/45 has-[textarea:focus]:ring-foreground">
        <div
          className={cn(
            "flex min-w-0 flex-1 basis-44 items-start gap-2 px-2 py-2.5",
            submitted && "opacity-70"
          )}
        >
          <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center text-muted-foreground"
          >
            <PencilIcon className="size-3.5" />
          </span>
          <Textarea
            ref={writeInInput}
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
            rows={1}
            placeholder={hasOptions ? "Write your own…" : "Type your answer…"}
            className={cn(
              "max-h-24 min-h-5 min-w-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent",
              questionTextClassName
            )}
          />
          {writeIn && !submitted && (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-5 shrink-0 text-muted-foreground"
              aria-label="Clear custom answer"
              onClick={() => {
                writeInInput.current?.focus();
                setSurvey((current) => current.clearCustom(qi));
              }}
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>

        <div className="ml-auto flex h-10 shrink-0 items-center gap-1.5">
          {survey.multiStep && survey.step > 0 && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              className={questionTextClassName}
              onClick={() => showStep(survey.back())}
              disabled={busy}
            >
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={questionTextClassName}
            onClick={onSkip}
            disabled={dismissal ? submitted : busy}
          >
            Skip
          </Button>
          <Button
            type="button"
            size="xs"
            className={questionTextClassName}
            onClick={advance}
            disabled={!canAdvance}
          >
            {hasNext ? "Next" : "Submit"}
          </Button>
        </div>
      </div>
    </AgentPromptCard>
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
