import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnsweredQuestionSummary, QuestionPrompt } from "./question-card";
import { QuestionSurvey } from "./question-survey";

const input = {
  questions: [
    {
      id: "format",
      header: "PrintSpecificationsAndLayoutForGalleryVisitors",
      question: "What format?",
      options: [{ label: "Booklet", description: "Four folded pages" }],
    },
    { id: "copies", question: "How many copies?", options: [{ label: "100" }] },
  ],
};

describe("QuestionPrompt", () => {
  it("keeps question navigation and Skip available while an optional batch awaits review", () => {
    const html = renderToStaticMarkup(
      <QuestionPrompt
        input={input}
        dismissal={{ transcript: null }}
        onSubmit={() => {}}
        submitDisabled
      />
    );

    expect(html).toContain(">1 of 2</span>");
    expect(html).toContain("What format?");
    expect(html).not.toContain(
      "PrintSpecificationsAndLayoutForGalleryVisitors"
    );
    expect(html).toContain("Four folded pages");
    expect(html).toMatch(
      /<button[^>]*data-question-choice=""[^>]*aria-pressed="false"/
    );
    expect(html).not.toContain('role="radio"');
    expect(html).toContain('aria-label="Question navigation"');
    const previous = html.match(
      /<button[^>]*aria-label="Previous question"[^>]*>/
    )?.[0];
    const next = html.match(
      /<button[^>]*aria-label="Next question"[^>]*>/
    )?.[0];
    const skip = html.match(/<button[^>]*>Skip<\/button>/)?.[0];
    expect(previous).toContain(' disabled=""');
    expect(next).toBeDefined();
    expect(next).not.toContain(' disabled=""');
    expect(skip).toBeDefined();
    expect(skip).not.toContain(' disabled=""');
    expect(html).not.toContain(">Submit</button>");
  });

  it("shows both final submission actions and keeps the answer editable", () => {
    const last = QuestionSurvey.from(input).next().skipCurrent();
    const source = vi.spyOn(QuestionSurvey, "from").mockReturnValueOnce(last);
    try {
      const html = renderToStaticMarkup(
        <QuestionPrompt input={input} onSubmit={() => {}} />
      );

      const previous = html.match(
        /<button[^>]*aria-label="Previous question"[^>]*>/
      )?.[0];
      const next = html.match(
        /<button[^>]*aria-label="Next question"[^>]*>/
      )?.[0];
      const submit = html.match(/<button[^>]*>Submit<\/button>/)?.[0];
      expect(html).toContain(">2 of 2</span>");
      const skip = html.match(/<button[^>]*>Skip<\/button>/)?.[0];
      expect(skip).toBeDefined();
      expect(skip).not.toContain(' disabled=""');
      expect(previous).toBeDefined();
      expect(previous).not.toContain(' disabled=""');
      expect(next).toContain(' disabled=""');
      expect(submit).toBeDefined();
      expect(submit).not.toContain(' disabled=""');
      expect(html.match(/<textarea[^>]*>/)?.[0]).not.toContain(' readonly=""');
    } finally {
      source.mockRestore();
    }
  });

  it("shows a selected final option alongside the explicit Submit action", () => {
    const last = QuestionSurvey.from(input)
      .togglePick(0, "Booklet")
      .next()
      .togglePick(1, "100");
    const source = vi.spyOn(QuestionSurvey, "from").mockReturnValueOnce(last);
    const onSubmit = vi.fn<(survey: QuestionSurvey) => void>();
    try {
      const html = renderToStaticMarkup(
        <QuestionPrompt input={input} onSubmit={onSubmit} />
      );
      expect(last.step).toBe(1);
      expect(last.batchAnswers()).toEqual([
        { id: "format", answer: { kind: "choice", index: 0 } },
        { id: "copies", answer: { kind: "choice", index: 0 } },
      ]);
      expect(html).toMatch(/<button[^>]*role="radio"[^>]*aria-checked="true"/);
      expect(html).toContain(">Submit</button>");
      expect(onSubmit).not.toHaveBeenCalled();
    } finally {
      source.mockRestore();
    }
  });
});

describe("AnsweredQuestionSummary", () => {
  it("shows correlated answers and skips from an accepted native batch", () => {
    const html = renderToStaticMarkup(
      <AnsweredQuestionSummary
        entry={{
          type: "dynamic-tool",
          toolName: "question",
          toolCallId: "batch",
          state: "output-available",
          input,
          output: {
            status: "answered",
            answers: [
              { id: "copies", answer: null },
              { id: "format", answer: "Booklet" },
            ],
          },
        }}
      />
    );

    expect(html).toContain("Booklet");
    expect(html).toContain("Skipped");
    expect(html.indexOf("Booklet")).toBeLessThan(html.indexOf("Skipped"));
  });

  it("does not report skips when an optional batch was only registered", () => {
    expect(
      renderToStaticMarkup(
        <AnsweredQuestionSummary
          entry={{
            type: "dynamic-tool",
            toolName: "question_async",
            toolCallId: "batch",
            state: "output-available",
            input,
            output: { status: "registered" },
          }}
        />
      )
    ).toBe("");
  });
});
