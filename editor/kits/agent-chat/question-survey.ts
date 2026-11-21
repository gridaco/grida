/**
 * `QuestionSurvey` — the pure, React-free core of the ask-user `question` tool's
 * form. It owns the per-question option selections, the free-text write-ins,
 * the per-question skip flags, the wizard step, and ALL derived semantics
 * (answer-building, validation, skip-vs-decline). The React `QuestionPrompt` is a
 * thin view: it holds one of these in state and swaps it for the next on each
 * transition. Immutable — every transition returns a NEW survey — so the view's
 * update is just `setSurvey(survey.next())` and the logic is testable on its own
 * with zero rendering.
 *
 * ## Answer model
 *
 * Native questions submit a choice, write-in, or explicit skip, correlated by
 * question ID for a batch. A draft stays unresolved until answered or skipped.
 * Older survey consumers use a positional array with an empty array for each
 * skip and a `skipped: true` sentinel when the entire survey was skipped.
 */

export type QuestionOption = { label: string; description?: string };

export type QuestionSpec = {
  id?: string;
  question: string;
  header?: string;
  options?: QuestionOption[];
  multi_select?: boolean;
};

/** The legacy positional survey result. */
export type QuestionAnswerOutput = { answers: string[][]; skipped?: boolean };

type QuestionAnswer =
  | { kind: "choice"; index: number }
  | { kind: "text"; text: string }
  | { kind: "skipped" };

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
    return this.count > 0 && this.step === this.count - 1;
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
  get unanswered(): readonly number[] {
    return this.questions.flatMap((_, index) =>
      this.isAnswered(index) || this.isSkipped(index) ? [] : [index]
    );
  }
  /** Every question is RESOLVED — answered OR explicitly skipped. */
  get canSubmit(): boolean {
    return this.count > 0 && this.unanswered.length === 0;
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

  /** Set the custom write-in text for `qi` (also makes it exclusive + un-skips). */
  setWriteIn(qi: number, text: string): QuestionSurvey {
    return this.with({
      picked: replace(this.picked, qi, []),
      writeIns: replace(this.writeIns, qi, text),
      skipped: replace(this.skipped, qi, false),
    });
  }

  /** Clear and deselect the custom write-in for `qi`, leaving the question blank. */
  clearCustom(qi: number): QuestionSurvey {
    return this.with({
      picked: replace(this.picked, qi, []),
      writeIns: replace(this.writeIns, qi, ""),
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

  skipUnanswered(): QuestionSurvey {
    return this.with({
      skipped: this.questions.map(
        (_, index) => this.isSkipped(index) || !this.isAnswered(index)
      ),
    });
  }

  goTo(step: number): QuestionSurvey {
    return step >= 0 && step < this.count && step !== this.step
      ? this.with({ step })
      : this;
  }

  /** Move forward, recording a skip when the current question is blank. */
  next(): QuestionSurvey {
    if (this.step + 1 >= this.count) return this;
    const current =
      this.isAnswered(this.step) || this.isSkipped(this.step)
        ? this
        : this.skipCurrent();
    return current.goTo(this.step + 1);
  }
  back(): QuestionSurvey {
    return this.goTo(this.step - 1);
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

  singleAnswer(): QuestionAnswer | null {
    return this.count === 1 ? this.answerAt(0) : null;
  }

  batchAnswers(): readonly { id: string; answer: QuestionAnswer }[] | null {
    if (!this.canSubmit) return null;
    const answers = [];
    const ids = new Set<string>();
    for (const [index, question] of this.questions.entries()) {
      const answer = this.answerAt(index);
      if (!question.id || ids.has(question.id) || !answer) return null;
      ids.add(question.id);
      answers.push({ id: question.id, answer });
    }
    return answers;
  }

  private answerAt(index: number): QuestionAnswer | null {
    const question = this.questions[index];
    if (!question || question.multi_select) return null;
    if (this.isSkipped(index)) return { kind: "skipped" };
    const text = this.writeInFor(index).trim();
    if (text) return { kind: "text", text };
    const choiceIndex = question.options?.findIndex(
      (option) => option.label === this.pickedFor(index)[0]
    );
    return choiceIndex !== undefined && choiceIndex >= 0
      ? { kind: "choice", index: choiceIndex }
      : null;
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
      ...(typeof q.id === "string" && { id: q.id }),
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
