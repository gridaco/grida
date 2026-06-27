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
 * Per the RFC (`tools` §question) the tool is text-only: each question offers
 * options to pick (single via radio, many via checkbox when `multi_select`) and
 * ALWAYS a free-text write-in, so the user can answer in their own words. "Skip"
 * dismisses the survey with a sentinel result so the model knows it was declined
 * (distinct from the headless refusal). Answers are `string[][]` — one array per
 * question.
 */

"use client";

import { useMemo, useState } from "react";
import { getToolName } from "ai";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Checkbox } from "@app/ui/components/checkbox";
import { Label } from "@app/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@app/ui/components/radio-group";
import { Textarea } from "@app/ui/components/textarea";
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat";

/** The `question` tool's result shape (mirrors the package `outputSchema`). */
export type QuestionAnswerOutput = {
  answers: string[][];
  skipped?: boolean;
};

/**
 * Commit an answer to the open `question`. The surface wires this to
 * `chat.addToolResult`, so the human's answer becomes the tool result and the
 * paused run resumes.
 */
export type AnswerQuestionHandler = (
  toolCallId: string,
  output: QuestionAnswerOutput
) => void;

type QuestionOption = { label: string; description?: string };
type QuestionSpec = {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multi_select?: boolean;
};

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

function readQuestions(entry: ToolCallEntry): QuestionSpec[] {
  const input = "input" in entry ? entry.input : undefined;
  const questions = (input as { questions?: unknown })?.questions;
  if (!Array.isArray(questions)) return [];
  return questions
    .filter((q): q is QuestionSpec => Boolean(q) && typeof q === "object")
    .map((q) => ({
      question: String(q.question ?? ""),
      header: typeof q.header === "string" ? q.header : undefined,
      options: Array.isArray(q.options)
        ? q.options
            .filter(
              (o): o is QuestionOption => Boolean(o) && typeof o === "object"
            )
            .map((o) => ({
              label: String(o.label ?? ""),
              description:
                typeof o.description === "string" ? o.description : undefined,
            }))
        : undefined,
      multi_select: Boolean(q.multi_select),
    }));
}

/**
 * The interactive survey form. Rendered while the `question` part is
 * `input-available` (the run is paused on the user). On submit/skip it calls
 * `onAnswer(toolCallId, output)`; the host wires that to `addToolResult`.
 */
export function QuestionCard({
  entry,
  onAnswer,
  disabled,
}: {
  entry: ToolCallEntry;
  onAnswer: (toolCallId: string, output: QuestionAnswerOutput) => void;
  disabled?: boolean;
}) {
  const questions = useMemo(() => readQuestions(entry), [entry]);
  // Per question: picked option labels + a free-text write-in.
  const [picked, setPicked] = useState<string[][]>(() =>
    questions.map(() => [])
  );
  const [writeIns, setWriteIns] = useState<string[]>(() =>
    questions.map(() => "")
  );
  const [submitted, setSubmitted] = useState(false);
  // A survey of >1 question is a one-at-a-time wizard: step through with
  // Back/Next, Submit on the last. A single question shows no stepper.
  const [step, setStep] = useState(0);

  const answers = useMemo(
    () =>
      questions.map((q, i) => {
        const wi = (writeIns[i] ?? "").trim();
        if (q.multi_select) {
          return [...(picked[i] ?? []), ...(wi ? [wi] : [])];
        }
        // Single-select: a write-in (the user's own words) wins over a pick.
        if (wi) return [wi];
        return (picked[i] ?? []).slice(0, 1);
      }),
    [questions, picked, writeIns]
  );

  const canSubmit =
    questions.length > 0 && answers.every((a) => a.length > 0) && !disabled;

  const submit = () => {
    if (!canSubmit) return;
    setSubmitted(true);
    onAnswer(toolCallIdOf(entry), { answers });
  };

  const skip = () => {
    if (disabled) return;
    setSubmitted(true);
    onAnswer(toolCallIdOf(entry), { answers: [], skipped: true });
  };

  const togglePick = (qi: number, label: string, multi: boolean) => {
    setPicked((prev) => {
      const next = prev.map((row) => [...row]);
      if (multi) {
        const row = next[qi] ?? [];
        next[qi] = row.includes(label)
          ? row.filter((l) => l !== label)
          : [...row, label];
      } else {
        next[qi] = [label];
      }
      return next;
    });
  };

  if (questions.length === 0) return null;

  const busy = disabled || submitted;
  const multiStep = questions.length > 1;
  const isLast = step === questions.length - 1;
  // The current step's question must be answered before advancing; on the last
  // step Submit additionally requires every question answered (`canSubmit`).
  const currentAnswered = (answers[step] ?? []).length > 0;

  const renderQuestion = (qi: number) => {
    const q = questions[qi];
    return (
      <div className="flex flex-col gap-2">
        {q.header && (
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {q.header}
          </span>
        )}
        <p className="text-sm font-medium">{q.question}</p>

        {q.options && q.options.length > 0 && !q.multi_select && (
          <RadioGroup
            value={(picked[qi] ?? [])[0] ?? ""}
            onValueChange={(label) => togglePick(qi, label, false)}
            disabled={busy}
            className="gap-1.5"
          >
            {q.options.map((opt, oi) => (
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

        {q.options && q.options.length > 0 && q.multi_select && (
          <div className="flex flex-col gap-1.5">
            {q.options.map((opt, oi) => (
              <Label
                key={oi}
                className="flex cursor-pointer items-start gap-2 text-sm font-normal"
              >
                <Checkbox
                  checked={(picked[qi] ?? []).includes(opt.label)}
                  onCheckedChange={() => togglePick(qi, opt.label, true)}
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
          value={writeIns[qi] ?? ""}
          onChange={(e) =>
            setWriteIns((prev) => {
              const next = [...prev];
              next[qi] = e.target.value;
              return next;
            })
          }
          disabled={busy}
          rows={2}
          placeholder={
            q.options && q.options.length > 0
              ? "Or write your own answer…"
              : "Type your answer…"
          }
          className="text-sm"
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {renderQuestion(multiStep ? step : 0)}

      <div className="flex items-center gap-2">
        {multiStep && (
          <span className="text-xs text-muted-foreground tabular-nums">
            Question {step + 1} of {questions.length}
          </span>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={skip}
          disabled={busy}
        >
          Skip
        </Button>
        {multiStep && step > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={busy}
          >
            Back
          </Button>
        )}
        {multiStep && !isLast ? (
          <Button
            type="button"
            size="sm"
            onClick={() =>
              setStep((s) => Math.min(questions.length - 1, s + 1))
            }
            disabled={!currentAnswered || busy}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!canSubmit || submitted}
          >
            Submit
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only echo of an answered (or skipped) survey — rendered once the
 * `question` part is terminal (`output-available`), so the transcript shows what
 * was asked and how the user answered.
 */
export function AnsweredQuestionSummary({ entry }: { entry: ToolCallEntry }) {
  const questions = readQuestions(entry);
  const output = ("output" in entry ? entry.output : undefined) as
    | QuestionAnswerOutput
    | undefined;
  if (questions.length === 0) return null;

  if (output?.skipped) {
    return (
      <div
        className={cn(
          "mt-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
        )}
      >
        You skipped this question.
      </div>
    );
  }

  const answers = output?.answers ?? [];
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
      {questions.map((q, qi) => (
        <div key={qi} className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{q.question}</span>
          <span className="text-sm font-medium">
            {(answers[qi] ?? []).join(", ") || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
