import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnsweredQuestionSummary, QuestionPrompt } from "./question-card";

const input = {
  questions: [
    {
      id: "format",
      header: "PrintSpecificationsAndLayoutForGalleryVisitors",
      question: "What format?",
      options: [{ label: "Booklet", description: "Four folded pages" }],
    },
    { id: "copies", question: "How many copies?" },
  ],
};

describe("QuestionPrompt", () => {
  it("keeps Next available while an optional batch awaits a refreshed review", () => {
    const html = renderToStaticMarkup(
      <QuestionPrompt
        input={input}
        dismissal={{ transcript: null }}
        onSubmit={() => {}}
        submitDisabled
      />
    );

    expect(html).toContain("Question 1 of 2");
    expect(html).toMatch(
      /class="[^"]*wrap-anywhere[^"]*">PrintSpecificationsAndLayoutForGalleryVisitors<\/span>/
    );
    expect(html).toContain("Four folded pages");
    const next = html.match(/<button[^>]*>Next<\/button>/)?.[0];
    const submit = html.match(/<button[^>]*>Submit<\/button>/)?.[0];
    expect(next).toBeDefined();
    expect(next).not.toContain(' disabled=""');
    expect(submit).toContain(' disabled=""');
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
