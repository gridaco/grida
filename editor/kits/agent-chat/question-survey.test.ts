import { describe, expect, it } from "vitest";
import { parseQuestions, QuestionSurvey } from "./question-survey";

const SINGLE = {
  questions: [
    {
      question: "Which color scheme?",
      options: [{ label: "Warm" }, { label: "Cool" }],
    },
  ],
};

const SURVEY = {
  questions: [
    { question: "Color?", options: [{ label: "Warm" }, { label: "Cool" }] },
    {
      question: "Sections?",
      multi_select: true,
      options: [{ label: "Hero" }, { label: "Pricing" }],
    },
    { question: "Anything else?" },
  ],
};

const NATIVE_BATCH = {
  questions: [
    {
      id: "color",
      question: "Color?",
      options: [{ label: "Warm" }, { label: "Cool" }],
    },
    { id: "sections", question: "Sections?" },
    { id: "other", question: "Anything else?" },
  ],
};

describe("parseQuestions", () => {
  it("drops malformed entries and coerces shapes", () => {
    const qs = parseQuestions({
      questions: [
        { question: "ok", options: [{ label: "A", description: "d" }, null] },
        null,
        42,
        { multi_select: true },
      ],
    });
    expect(qs).toHaveLength(2);
    expect(qs[0]).toEqual({
      question: "ok",
      header: undefined,
      options: [{ label: "A", description: "d" }],
      multi_select: false,
    });
    expect(qs[1].question).toBe(""); // coerced; no `question` field
  });

  it("is empty for non-array / missing input", () => {
    expect(parseQuestions(undefined)).toEqual([]);
    expect(parseQuestions({})).toEqual([]);
    expect(parseQuestions({ questions: "nope" })).toEqual([]);
  });
});

describe("QuestionSurvey — answer building", () => {
  it("distinguishes a native choice, matching written text, and a skip", () => {
    const survey = QuestionSurvey.from(SINGLE);
    expect(survey.singleAnswer()).toBeNull();
    expect(survey.togglePick(0, "Cool").singleAnswer()).toEqual({
      kind: "choice",
      index: 1,
    });
    expect(survey.setWriteIn(0, "Cool").singleAnswer()).toEqual({
      kind: "text",
      text: "Cool",
    });
    expect(survey.skipCurrent().singleAnswer()).toEqual({ kind: "skipped" });
  });

  it("builds a native batch with choices, write-ins, and explicit skips in prompt order", () => {
    const survey = QuestionSurvey.from(NATIVE_BATCH)
      .setWriteIn(2, "  Add a gallery  ")
      .togglePick(0, "Cool");
    expect(survey.batchAnswers()).toBeNull();
    expect(survey.skipUnanswered().batchAnswers()).toEqual([
      { id: "color", answer: { kind: "choice", index: 1 } },
      { id: "sections", answer: { kind: "skipped" } },
      { id: "other", answer: { kind: "text", text: "Add a gallery" } },
    ]);
    expect(survey.unanswered).toEqual([1]);
  });

  it("requires distinct native batch question IDs", () => {
    const duplicate = NATIVE_BATCH.questions[0];
    expect(
      QuestionSurvey.from({ questions: [duplicate, duplicate] })
        .skipUnanswered()
        .batchAnswers()
    ).toBeNull();
    expect(
      QuestionSurvey.from(SINGLE).skipUnanswered().batchAnswers()
    ).toBeNull();
  });

  it("single-select: a pick is the answer", () => {
    const s = QuestionSurvey.from(SINGLE).togglePick(0, "Warm");
    expect(s.answersFor(0)).toEqual(["Warm"]);
    expect(s.buildOutput()).toEqual({ answers: [["Warm"]] });
  });

  it("single-select: a second pick replaces the first", () => {
    const s = QuestionSurvey.from(SINGLE)
      .togglePick(0, "Warm")
      .togglePick(0, "Cool");
    expect(s.answersFor(0)).toEqual(["Cool"]);
  });

  it("multi-select: picks accumulate and toggle off", () => {
    const s = QuestionSurvey.from(SURVEY)
      .togglePick(1, "Hero")
      .togglePick(1, "Pricing")
      .togglePick(1, "Hero");
    expect(s.answersFor(1)).toEqual(["Pricing"]);
  });

  it("custom write-in WINS over a pick (mutually exclusive)", () => {
    const picked = QuestionSurvey.from(SINGLE).togglePick(0, "Warm");
    const custom = picked.setWriteIn(0, "Pastel");
    expect(custom.pickedFor(0)).toEqual([]); // pick cleared
    expect(custom.answersFor(0)).toEqual(["Pastel"]);
  });

  it("keeps an inactive write-in draft for each step", () => {
    const s = QuestionSurvey.from(SINGLE)
      .setWriteIn(0, "Pastel")
      .togglePick(0, "Cool");
    expect(s.writeInFor(0)).toBe("");
    expect(s.answersFor(0)).toEqual(["Cool"]);
    expect(s.singleAnswer()).toEqual({ kind: "choice", index: 1 });
    expect(s.selectWriteIn(0).singleAnswer()).toEqual({
      kind: "text",
      text: "Pastel",
    });

    const batch = QuestionSurvey.from(SURVEY)
      .setWriteIn(0, "Pastel")
      .skipCurrent()
      .next()
      .setWriteIn(1, "Program")
      .back();
    expect(batch.answersFor(0)).toEqual([]);
    expect(batch.selectWriteIn(0).writeInFor(0)).toBe("Pastel");
    expect(batch.selectWriteIn(0).writeInFor(1)).toBe("Program");
    expect(batch.clearCustom(0).selectWriteIn(0).writeInFor(0)).toBe("");
  });

  it("keeps a choice through navigation and replaces it only when a write-in is edited", () => {
    const answered = QuestionSurvey.from(SURVEY)
      .togglePick(0, "Warm")
      .next()
      .setWriteIn(1, "Program")
      .back();

    expect(answered.answersFor(0)).toEqual(["Warm"]);
    expect(answered.answersFor(1)).toEqual(["Program"]);
    const changed = answered.setWriteIn(0, "Pastel");
    expect(changed.answersFor(0)).toEqual(["Pastel"]);
    expect(changed.pickedFor(0)).toEqual([]);
    expect(changed.answersFor(1)).toEqual(["Program"]);
  });

  it("clearCustom clears a write-in", () => {
    const s = QuestionSurvey.from(SINGLE)
      .setWriteIn(0, "Pastel")
      .clearCustom(0);
    expect(s.writeInFor(0)).toBe("");
    expect(s.answersFor(0)).toEqual([]);
  });
});

describe("QuestionSurvey — skip semantics", () => {
  it("skipping the ONLY question declines the whole survey (skipped sentinel)", () => {
    const s = QuestionSurvey.from(SINGLE).skipCurrent();
    expect(s.buildOutput()).toEqual({ answers: [], skipped: true });
  });

  it("THE BUG: answer Q1/Q2, skip only Q3 → kept answers + empty Q3, NOT a decline", () => {
    // Step through the wizard exactly like the UI: answer 1, answer 2, skip 3.
    const s = QuestionSurvey.from(SURVEY)
      .togglePick(0, "Warm")
      .next()
      .togglePick(1, "Hero")
      .next()
      .skipCurrent(); // step is now 2 (the last) → skip it
    expect(s.buildOutput()).toEqual({ answers: [["Warm"], ["Hero"], []] });
    expect(s.buildOutput().skipped).toBeUndefined();
  });

  it("skipping every question declines the whole survey", () => {
    const s = QuestionSurvey.from(SURVEY)
      .skipCurrent()
      .next()
      .skipCurrent()
      .next()
      .skipCurrent();
    expect(s.buildOutput()).toEqual({ answers: [], skipped: true });
  });

  it("a skipped question can be un-skipped by answering it", () => {
    const s = QuestionSurvey.from(SINGLE).skipCurrent();
    expect(s.isSkipped(0)).toBe(true);
    const back = s.togglePick(0, "Warm");
    expect(back.isSkipped(0)).toBe(false);
    expect(back.answersFor(0)).toEqual(["Warm"]);
  });
});

describe("QuestionSurvey — validation & stepping", () => {
  it("canSubmit requires every question RESOLVED (answered or skipped)", () => {
    let s = QuestionSurvey.from(SURVEY);
    expect(s.canSubmit).toBe(false);
    s = s.togglePick(0, "Warm");
    expect(s.canSubmit).toBe(false); // Q2/Q3 unresolved
    s = s.next().togglePick(1, "Hero").next().skipCurrent();
    expect(s.canSubmit).toBe(true); // all answered-or-skipped
  });

  it("revisits unanswered questions without changing other answers", () => {
    const last = QuestionSurvey.from(NATIVE_BATCH)
      .goTo(2)
      .setWriteIn(2, "A saved draft");
    expect(last.unanswered).toEqual([0, 1]);
    const first = last.goTo(last.unanswered[0]);
    expect(first.step).toBe(0);
    expect(first.next().back().step).toBe(0);
    expect(first.next().next().writeInFor(2)).toBe("A saved draft");
  });

  it("skips a blank question on Next and keeps answers when moving forward", () => {
    const middle = QuestionSurvey.from(NATIVE_BATCH).next();
    expect(middle.step).toBe(1);
    expect(middle.isSkipped(0)).toBe(true);
    expect(middle.unanswered).toEqual([1, 2]);

    const last = middle.setWriteIn(1, "Gallery").next();
    expect(last.step).toBe(2);
    expect(last.next()).toBe(last);
    expect(last.back().writeInFor(1)).toBe("Gallery");
    expect(last.skipCurrent().batchAnswers()).toEqual([
      { id: "color", answer: { kind: "skipped" } },
      { id: "sections", answer: { kind: "text", text: "Gallery" } },
      { id: "other", answer: { kind: "skipped" } },
    ]);
  });

  it("next / back clamp to range and isLast is correct", () => {
    const s = QuestionSurvey.from(SURVEY);
    expect(s.back().step).toBe(0); // clamped
    const mid = s.next();
    expect(mid.step).toBe(1);
    expect(mid.isLast).toBe(false);
    const last = mid.next();
    expect(last.step).toBe(2);
    expect(last.isLast).toBe(true);
    expect(last.next().step).toBe(2); // clamped
  });

  it("multiStep is false for a single question", () => {
    expect(QuestionSurvey.from(SINGLE).multiStep).toBe(false);
    expect(QuestionSurvey.from(SURVEY).multiStep).toBe(true);
  });

  it("an empty survey (defensive parse) keeps step in range and isLast false", () => {
    const s = QuestionSurvey.from({ questions: "nope" });
    expect(s.count).toBe(0);
    expect(s.isLast).toBe(false);
    expect(s.next().step).toBe(0); // not -1
    expect(s.next().isLast).toBe(false);
  });
});
