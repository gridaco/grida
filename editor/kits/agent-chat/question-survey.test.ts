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

  it("picking after a write-in clears the custom text", () => {
    const s = QuestionSurvey.from(SINGLE)
      .setWriteIn(0, "Pastel")
      .togglePick(0, "Cool");
    expect(s.writeInFor(0)).toBe("");
    expect(s.answersFor(0)).toEqual(["Cool"]);
  });

  it("selectCustom deselects options for that question", () => {
    const s = QuestionSurvey.from(SINGLE).togglePick(0, "Warm").selectCustom(0);
    expect(s.pickedFor(0)).toEqual([]);
    expect(s.answersFor(0)).toEqual([]); // nothing typed yet
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

  it("currentAnswered tracks the active step", () => {
    const s = QuestionSurvey.from(SURVEY);
    expect(s.currentAnswered).toBe(false);
    expect(s.togglePick(0, "Warm").currentAnswered).toBe(true);
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
