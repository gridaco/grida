/**
 * `QuestionSurvey` — the pure, React-free core of the ask-user `question` tool's
 * form. It owns the per-question option selections, the free-text write-ins,
 * the per-question skip flags, the wizard step, and ALL derived semantics
 * (answer-building, validation, skip-vs-decline). The React `QuestionCard` is a
 * thin view: it holds one of these in state and swaps it for the next on each
 * transition. Immutable — every transition returns a NEW survey — so the view's
 * update is just `setSurvey(survey.next())` and the logic is testable on its own
 * with zero rendering.
 *
 * ## Answer model (the subtle part)
 *
 * The tool returns `{ answers: string[][] }` — one array per question. A question
 * is answered by picking option(s) and/or writing a custom answer; picking and
 * writing are MUTUALLY EXCLUSIVE (when there's custom text, it IS the answer).
 *
 * "Skip" is **per question**, not per survey. Skipping the last question of a
 * three-question survey you answered the first two of yields
 * `{ answers: [a, b, []] }` — the kept answers plus an empty array for the
 * skipped one. The `skipped: true` sentinel is reserved for the case where the
 * user resolved NOTHING (declined the entire survey); the model reads that as
 * "the user passed on the whole thing" — distinct from the headless refusal.
 */

export type QuestionOption = { label: string; description?: string };

export type QuestionSpec = {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multi_select?: boolean;
};

/** The `question` tool's result shape (mirrors the package `outputSchema`). */
export type QuestionAnswerOutput = { answers: string[][]; skipped?: boolean };

export class QuestionSurvey {
  private constructor(
    readonly questions: readonly QuestionSpec[],
    private readonly picked: readonly (readonly string[])[],
    private readonly writeIns: readonly string[],
    private readonly skipped: readonly boolean[],
    readonly step: number
  ) {}

  /** Build a fresh survey from a tool call's `input` (defensive parse). */
  static from(input: unknown): QuestionSurvey {
    const questions = parseQuestions(input);
    return new QuestionSurvey(
      questions,
      questions.map(() => []),
      questions.map(() => ""),
      questions.map(() => false),
      0
    );
  }

  // ── derived ─────────────────────────────────────────────────────────────
  get count(): number {
    return this.questions.length;
  }
  /** A survey of >1 question is a one-at-a-time wizard. */
  get multiStep(): boolean {
    return this.count > 1;
  }
  get isLast(): boolean {
    return this.step === this.count - 1;
  }

  pickedFor(qi: number): readonly string[] {
    return this.picked[qi] ?? [];
  }
  writeInFor(qi: number): string {
    return this.writeIns[qi] ?? "";
  }
  isSkipped(qi: number): boolean {
    return this.skipped[qi] === true;
  }

  /** The committed answer array for question `qi` — empty when skipped or blank.
   *  A custom write-in wins over a pick (they are mutually exclusive). */
  answersFor(qi: number): string[] {
    if (this.skipped[qi]) return [];
    const wi = (this.writeIns[qi] ?? "").trim();
    const q = this.questions[qi];
    if (q?.multi_select) {
      return [...(this.picked[qi] ?? []), ...(wi ? [wi] : [])];
    }
    if (wi) return [wi];
    return (this.picked[qi] ?? []).slice(0, 1);
  }
  isAnswered(qi: number): boolean {
    return this.answersFor(qi).length > 0;
  }
  /** The current step's question is answered — Next / Submit require this. */
  get currentAnswered(): boolean {
    return this.isAnswered(this.step);
  }
  /** Every question is RESOLVED — answered OR explicitly skipped. */
  get canSubmit(): boolean {
    return (
      this.count > 0 &&
      this.questions.every((_, i) => this.isAnswered(i) || this.skipped[i])
    );
  }

  // ── transitions (each returns a NEW survey) ───────────────────────────────
  /** Toggle an option for question `qi`. Picking is exclusive with the
   *  write-in and un-skips the question. */
  togglePick(qi: number, label: string): QuestionSurvey {
    const q = this.questions[qi];
    if (!q) return this;
    const cur = this.picked[qi] ?? [];
    const next = q.multi_select
      ? cur.includes(label)
        ? cur.filter((l) => l !== label)
        : [...cur, label]
      : [label];
    return this.with({
      picked: replace(this.picked, qi, next),
      writeIns: replace(this.writeIns, qi, ""),
      skipped: replace(this.skipped, qi, false),
    });
  }

  /** Make the custom write-in the active answer for `qi` — deselect options and
   *  un-skip (e.g. on focus). No-op once already exclusive. */
  selectCustom(qi: number): QuestionSurvey {
    if ((this.picked[qi] ?? []).length === 0 && !this.skipped[qi]) return this;
    return this.with({
      picked: replace(this.picked, qi, []),
      skipped: replace(this.skipped, qi, false),
    });
  }

  /** Set the custom write-in text for `qi` (also makes it exclusive + un-skips). */
  setWriteIn(qi: number, text: string): QuestionSurvey {
    return this.with({
      picked: replace(this.picked, qi, []),
      writeIns: replace(this.writeIns, qi, text),
      skipped: replace(this.skipped, qi, false),
    });
  }

  /** Skip the CURRENT question: clear its inputs and mark it skipped. Does not
   *  move the step — the view decides whether to advance or finalize. */
  skipCurrent(): QuestionSurvey {
    const qi = this.step;
    return this.with({
      picked: replace(this.picked, qi, []),
      writeIns: replace(this.writeIns, qi, ""),
      skipped: replace(this.skipped, qi, true),
    });
  }

  next(): QuestionSurvey {
    return this.withStep(Math.min(this.count - 1, this.step + 1));
  }
  back(): QuestionSurvey {
    return this.withStep(Math.max(0, this.step - 1));
  }

  // ── output ────────────────────────────────────────────────────────────────
  /** The tool result. Per-question answers (empty for skipped/blank); the
   *  `skipped` sentinel ONLY when the user resolved nothing (declined the whole
   *  survey) — a partial answer is NOT a decline. */
  buildOutput(): QuestionAnswerOutput {
    const answers = this.questions.map((_, i) => this.answersFor(i));
    if (answers.every((a) => a.length === 0))
      return { answers: [], skipped: true };
    return { answers };
  }

  // ── internals ───────────────────────────────────────────────────────────
  private with(p: {
    picked?: readonly (readonly string[])[];
    writeIns?: readonly string[];
    skipped?: readonly boolean[];
    step?: number;
  }): QuestionSurvey {
    return new QuestionSurvey(
      this.questions,
      p.picked ?? this.picked,
      p.writeIns ?? this.writeIns,
      p.skipped ?? this.skipped,
      p.step ?? this.step
    );
  }
  private withStep(step: number): QuestionSurvey {
    return step === this.step ? this : this.with({ step });
  }
}

function replace<T>(arr: readonly T[], i: number, value: T): T[] {
  const next = arr.slice();
  next[i] = value;
  return next;
}

/** Defensive parse of a tool call's `input` into the question list. Tolerates
 *  malformed entries (the model's JSON is untrusted) — bad items are dropped. */
export function parseQuestions(input: unknown): QuestionSpec[] {
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
