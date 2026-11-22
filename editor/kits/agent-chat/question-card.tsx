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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  XIcon,
} from "lucide-react";
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
const choiceAdvanceDelayMs = 280;

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
  const [confirmingSkips, setConfirmingSkips] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const questionText = useRef<HTMLParagraphElement>(null);
  const choices = useRef<HTMLDivElement>(null);
  const previousStep = useRef(survey.step);
  const previousHeight = useRef<number | undefined>(undefined);
  const reopen = useRef<HTMLButtonElement>(null);
  const writeInInput = useRef<HTMLTextAreaElement>(null);
  const keepAnsweringButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const choiceFlash = useRef<Animation | null>(null);
  useLayoutEffect(
    () => () => choiceFlash.current?.cancel(),
    [closed, confirmingSkips, survey.step]
  );
  useLayoutEffect(() => {
    if (confirmingSkips) {
      keepAnsweringButton.current?.focus();
      return;
    }
    if (restoreFocus.current) {
      (closed ? reopen.current : form.current)?.focus();
      restoreFocus.current = false;
    }
  }, [closed, confirmingSkips, survey.step]);
  useLayoutEffect(() => {
    const from = previousStep.current;
    previousStep.current = survey.step;
    const fromHeight = previousHeight.current;
    previousHeight.current = undefined;
    if (
      from === survey.step ||
      closed ||
      confirmingSkips ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const rtl = questionText.current?.matches(":dir(rtl)");
    const offset = (survey.step > from ? 1 : -1) * (rtl ? -12 : 12);
    const timing = { duration: 180, easing: "ease-out" };
    const card = form.current;
    const toHeight = card?.offsetHeight;
    const resize =
      card && fromHeight !== undefined && toHeight !== fromHeight
        ? card.animate(
            [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
            timing
          )
        : undefined;
    const sweep = [questionText.current, choices.current].map((element) =>
      element?.animate(
        [
          { opacity: 0.45, translate: `${offset}px` },
          { opacity: 1, translate: "0px" },
        ],
        timing
      )
    );
    return () => {
      resize?.cancel();
      sweep.forEach((animation) => animation?.cancel());
    };
  }, [closed, confirmingSkips, survey.step]);

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
  const canSubmit = !busy && (survey.multiStep || survey.canSubmit);
  const skipDisabled =
    hasNext || (!survey.multiStep && dismissal) ? submitted : busy;
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
          {survey.multiStep ? "Answer questions" : "Answer question"}
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
    if (next.step !== survey.step) {
      previousHeight.current = form.current?.offsetHeight;
    }
    restoreFocus.current = true;
    setSurvey(next);
  };
  const requestSubmit = (answers = survey) => {
    if (busy || (!answers.multiStep && !answers.canSubmit)) return;
    setSurvey(answers);
    if (answers.canSubmit) finalize(answers);
    else setConfirmingSkips(true);
  };
  const onSkip = () => {
    if (survey.multiStep) {
      const skipped = survey.skipCurrent();
      if (hasNext) showStep(skipped.next());
      else requestSubmit(skipped);
    } else if (dismissal) {
      changeClosed(true);
    } else {
      finalize(survey.skipCurrent());
    }
  };
  const advance = () => {
    if (submitted) return;
    if (hasNext) showStep(survey.next());
    else requestSubmit();
  };

  if (confirmingSkips) {
    const unanswered = survey.unanswered;
    const titleId = `${labelId}-confirm-skips`;
    const keepAnswering = () => {
      setConfirmingSkips(false);
      showStep(survey.goTo(unanswered[0]));
    };
    return (
      <AgentPromptCard
        data-question-prompt=""
        role="group"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          keepAnswering();
        }}
      >
        <div className="flex min-h-6 items-center gap-2 px-2 text-muted-foreground">
          <MessageCircleQuestionIcon aria-hidden className="size-4 shrink-0" />
          <span>Question</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ms-auto"
            aria-label="Close confirmation"
            onClick={keepAnswering}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
        <p id={titleId} className="px-2">
          Skip {unanswered.length} unanswered{" "}
          {unanswered.length === 1 ? "question" : "questions"}?
        </p>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button
            ref={keepAnsweringButton}
            type="button"
            variant="outline"
            size="xs"
            onClick={keepAnswering}
          >
            Keep answering
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={busy}
            onClick={() => {
              restoreFocus.current = true;
              setConfirmingSkips(false);
              finalize(survey.skipUnanswered());
            }}
          >
            Submit with skips
          </Button>
        </div>
      </AgentPromptCard>
    );
  }

  const handlePromptKey = (event: KeyboardEvent<HTMLDivElement>) => {
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
      !(target instanceof Element)
    ) {
      return;
    }

    const input = writeInInput.current;
    const leaveWriteIn =
      key === "ArrowUp" &&
      input === target &&
      input.selectionStart === 0 &&
      input.selectionEnd === 0;
    if (
      !leaveWriteIn &&
      target.closest("input, textarea, select, [contenteditable]")
    ) {
      return;
    }

    if (survey.multiStep && (key === "ArrowLeft" || key === "ArrowRight")) {
      event.preventDefault();
      event.stopPropagation();
      const rtl = event.currentTarget.matches(":dir(rtl)");
      const forward = (key === "ArrowRight") !== rtl;
      if (forward && hasNext) showStep(survey.next());
      if (!forward && survey.step > 0) showStep(survey.back());
      return;
    }

    if (key === "ArrowUp" || key === "ArrowDown") {
      const buttons = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>(
          "[data-question-choice]"
        )
      );
      if (!buttons.length) return;
      event.preventDefault();
      event.stopPropagation();
      choiceFlash.current?.cancel();
      const focused = buttons.findIndex((button) => button.contains(target));
      const selected = survey.isWriteInSelected(qi)
        ? buttons.length
        : options.findIndex((option) =>
            survey.pickedFor(qi).includes(option.label)
          );
      const current = leaveWriteIn
        ? buttons.length
        : focused >= 0
          ? focused
          : selected;
      const down = key === "ArrowDown";
      const index =
        current < 0
          ? down
            ? 0
            : buttons.length
          : Math.min(buttons.length, Math.max(0, current + (down ? 1 : -1)));
      const button = buttons[index];
      if (!button) {
        if (input) {
          setSurvey((current) => current.selectWriteIn(qi));
          input.focus();
        }
        return;
      }
      button.focus();
      if (!q.multi_select) {
        setSurvey((current) => current.togglePick(qi, options[index].label));
      }
      return;
    }

    if (
      key === "Enter" &&
      (target === event.currentTarget ||
        target.closest("[data-question-choice]"))
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && survey.isAnswered(qi)) advance();
      return;
    }

    if (q.multi_select || !/^[1-9]$/.test(key)) return;
    const option = event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "[data-question-choice]"
    )[Number(key) - 1];
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;

    option.focus();
    option.click();
  };

  const selectAndAdvance = (option: HTMLButtonElement, label: string) => {
    choiceFlash.current?.cancel();
    const answered = survey.togglePick(qi, label);
    setSurvey(answered);
    const highlight = { backgroundColor: "var(--color-accent)" };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const flash = option.animate(
      reducedMotion.matches
        ? [highlight, highlight]
        : [highlight, { backgroundColor: "transparent" }, highlight],
      { duration: choiceAdvanceDelayMs }
    );
    choiceFlash.current = flash;
    flash.onfinish = () => {
      choiceFlash.current = null;
      showStep(answered.next());
    };
  };

  const singleChoices =
    !q.multi_select &&
    options.map((opt, index) => {
      const selected = survey.pickedFor(qi)[0] === opt.label;
      const props = {
        "aria-keyshortcuts": index < 9 ? String(index + 1) : undefined,
        "data-question-choice": "",
        className: cn(
          "w-full text-start outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          optionRowClassName(selected, submitted)
        ),
      };
      const label = (
        <>
          <span
            aria-hidden
            className={cn(
              "grid h-5 min-w-5 shrink-0 place-items-center rounded-sm border bg-muted px-1 leading-none text-muted-foreground tabular-nums",
              selected && "border-primary bg-primary text-primary-foreground"
            )}
          >
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-col wrap-anywhere">
            <span>{opt.label}</span>
            {opt.description && (
              <span className="text-muted-foreground">{opt.description}</span>
            )}
          </span>
        </>
      );

      // These choices are actions. Moving keyboard focus to one must not advance.
      return hasNext ? (
        <button
          {...props}
          key={index}
          type="button"
          disabled={submitted}
          aria-pressed={selected}
          onBlur={() => choiceFlash.current?.cancel()}
          onClick={(event) => selectAndAdvance(event.currentTarget, opt.label)}
        >
          {label}
        </button>
      ) : (
        <RadioGroup.Item
          {...props}
          key={index}
          value={opt.label}
          onDoubleClick={
            survey.multiStep
              ? () => requestSubmit(survey.togglePick(qi, opt.label))
              : undefined
          }
        >
          {label}
        </RadioGroup.Item>
      );
    });

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
      onKeyDownCapture={handlePromptKey}
      onKeyDown={(event) => {
        if (event.key === "Escape" && dismissal && !submitted) {
          event.stopPropagation();
          changeClosed(true);
        }
      }}
    >
      <div className="flex min-h-6 items-center gap-2 px-2 text-muted-foreground">
        <MessageCircleQuestionIcon aria-hidden className="size-4 shrink-0" />
        <span>Question</span>
        {survey.multiStep && (
          <div
            role="group"
            aria-label="Question navigation"
            className="ms-auto flex items-center gap-1"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Previous question"
              disabled={submitted || survey.step === 0}
              onClick={() => showStep(survey.back())}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            <span className="text-xs tabular-nums">
              {survey.step + 1} of {survey.count}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Next question"
              disabled={submitted || !hasNext}
              onClick={advance}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={survey.multiStep ? undefined : "ms-auto"}
          aria-label={survey.multiStep ? "Skip question" : "Close question"}
          disabled={skipDisabled}
          onClick={onSkip}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      <p
        ref={questionText}
        id={questionId}
        className="mb-2 min-h-0 overflow-y-auto wrap-anywhere px-2"
      >
        {q.question}
      </p>

      {hasOptions && (
        <div ref={choices} className="-m-1 min-h-0 overflow-y-auto p-1">
          {!q.multi_select ? (
            hasNext ? (
              <div
                role="group"
                aria-labelledby={questionId}
                className="grid gap-0.5"
              >
                {singleChoices}
              </div>
            ) : (
              <RadioGroup.Root
                aria-labelledby={questionId}
                orientation="vertical"
                value={survey.pickedFor(qi)[0] ?? ""}
                onValueChange={(label) =>
                  setSurvey(survey.togglePick(qi, label))
                }
                disabled={submitted}
                className="grid gap-0.5"
              >
                {singleChoices}
              </RadioGroup.Root>
            )
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
                      data-question-choice=""
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
            onClick={
              submitted
                ? undefined
                : () => setSurvey((current) => current.selectWriteIn(qi))
            }
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
              if (!event.repeat && survey.isAnswered(qi)) advance();
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
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={questionTextClassName}
            onClick={onSkip}
            disabled={skipDisabled}
          >
            Skip
          </Button>
          <Button
            type="button"
            size="xs"
            className={questionTextClassName}
            onClick={advance}
            disabled={hasNext ? submitted : !canSubmit}
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
    | {
        answers?: (string[] | { id: string; answer: string | null })[];
        skipped?: boolean;
      }
    | undefined;
  if (questions.length === 0) return null;

  if (output?.skipped) {
    return (
      <div className="mt-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        You skipped this.
      </div>
    );
  }

  // An optional tool call only registers the questions. Its answer may arrive
  // separately as a host-attributed user message.
  if (!Array.isArray(output?.answers)) return null;
  const answers = output.answers;
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
      {questions.map((q, qi) => {
        const answer = q.id
          ? answers.find((item) => !Array.isArray(item) && item?.id === q.id)
          : answers[qi];
        const values = Array.isArray(answer)
          ? answer
          : typeof answer?.answer === "string"
            ? [answer.answer]
            : [];
        return (
          <div key={qi} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{q.question}</span>
            <span
              className={cn(
                "text-sm font-medium",
                values.length === 0 && "text-muted-foreground italic"
              )}
            >
              {values.length ? values.join(", ") : "Skipped"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
