import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { NativeChatTurnSummary } from "@grida/desktop-bridge";
import { NativeTurnSummary } from "./native-turn-summary";

const settled: NativeChatTurnSummary = {
  turnId: "fixture-turn",
  status: "succeeded",
  text: "The turn finished.",
  textTruncated: false,
  steps: 1,
  unresolvedOperations: 0,
  toolActivity: null,
  checks: [],
};

function render(summary: NativeChatTurnSummary) {
  return renderToStaticMarkup(
    createElement(NativeTurnSummary, { summary, messages: [] })
  );
}

it("shows reported zero and partial coverage without inventing missing categories", () => {
  expect(render(settled)).toBe("");
  const html = render({
    ...settled,
    tokenUsage: {
      reported: [
        { category: "input", tokens: "7", partial: true },
        { category: "cached_input", tokens: "0", partial: true },
      ],
      attemptsWithoutCounts: 1,
    },
  });
  expect(html).toContain("Provider-reported tokens");
  expect(html).toContain("Input 7 (partial) · Cached input 0 (partial)");
  expect(html).toContain("Token counts unknown for 1 model request.");
  expect(html).not.toContain("Output 0");
});

it("distinguishes unreported usage from an explicitly reported zero", () => {
  const html = render({
    ...settled,
    tokenUsage: { reported: [], attemptsWithoutCounts: 2 },
  });
  expect(html).toContain("Token counts unknown for 2 model requests.");
  expect(html).not.toContain("Input 0");
});
