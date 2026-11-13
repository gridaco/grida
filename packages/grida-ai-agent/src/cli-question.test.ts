import { describe, expect, it } from "vitest";
import {
  askQuestions,
  findPendingQuestion,
  formatQuestion,
  interpretAnswer,
  type CliPrompter,
} from "./cli-question";
import type { ChatMessageWithParts, ChatPartRow } from "./session/rows";

/** A prompter fed from a fixed script; `null` entries simulate end of input. */
function scripted(lines: Array<string | null>): CliPrompter & {
  shown: string[];
  prompts: string[];
} {
  const queue = [...lines];
  const shown: string[] = [];
  const prompts: string[] = [];
  return {
    shown,
    prompts,
    write: (text) => void shown.push(text),
    ask: async (prompt) => {
      prompts.push(prompt);
      return queue.length > 0 ? (queue.shift() ?? null) : null;
    },
  };
}

const color = {
  question: "Which palette?",
  options: [
    { label: "Warm", description: "Reds and oranges" },
    { label: "Cool" },
  ],
};

describe("interpretAnswer", () => {
  it("maps an option number to its label", () => {
    expect(interpretAnswer(color, " 2 ")).toEqual({
      ok: true,
      answers: ["Cool"],
    });
  });

  it("treats an empty line as skipping the question", () => {
    expect(interpretAnswer(color, "   ")).toEqual({ ok: true, answers: [] });
  });

  it("records any other text as a write-in", () => {
    expect(interpretAnswer(color, "Monochrome")).toEqual({
      ok: true,
      answers: ["Monochrome"],
    });
  });

  it("keeps an out-of-range number as a write-in", () => {
    expect(interpretAnswer(color, "5")).toEqual({ ok: true, answers: ["5"] });
    expect(interpretAnswer({ question: "How many?" }, "3")).toEqual({
      ok: true,
      answers: ["3"],
    });
  });

  it("accepts several distinct numbers only for multi_select", () => {
    expect(interpretAnswer({ ...color, multi_select: true }, "2, 1,2")).toEqual(
      { ok: true, answers: ["Cool", "Warm"] }
    );
    expect(interpretAnswer(color, "1,2")).toEqual({
      ok: false,
      reason: "Pick one option.",
    });
  });
});

describe("formatQuestion", () => {
  it("shows progress, header, and numbered options", () => {
    expect(
      formatQuestion({ ...color, header: "Style" }, 0, 2).split("\n")
    ).toEqual([
      "",
      "[question (1/2)] Style: Which palette?",
      "  1. Warm — Reds and oranges",
      "  2. Cool",
      "",
    ]);
  });
});

describe("askQuestions", () => {
  it("answers each question in order", async () => {
    const prompter = scripted(["1", "", "tabs"]);
    const output = await askQuestions(
      {
        questions: [color, { question: "Name?" }, { question: "Indent?" }],
      },
      prompter
    );
    expect(output).toEqual({ answers: [["Warm"], [], ["tabs"]] });
    expect(prompter.prompts).toHaveLength(3);
  });

  it("re-prompts when a single-select answer picks several options", async () => {
    const prompter = scripted(["1,2", "2"]);
    expect(await askQuestions({ questions: [color] }, prompter)).toEqual({
      answers: [["Cool"]],
    });
    expect(prompter.shown).toContain("  Pick one option.\n");
  });

  it("returns the skipped sentinel when nothing was answered", async () => {
    expect(await askQuestions({ questions: [color] }, scripted([""]))).toEqual({
      answers: [],
      skipped: true,
    });
  });

  it("keeps earlier answers and skips the rest when input ends", async () => {
    const output = await askQuestions(
      { questions: [color, { question: "Name?" }] },
      scripted(["2", null])
    );
    expect(output).toEqual({ answers: [["Cool"], []] });
  });

  it("skips an input that does not match the tool schema without asking", async () => {
    const prompter = scripted(["1"]);
    expect(await askQuestions({ questions: [] }, prompter)).toEqual({
      answers: [],
      skipped: true,
    });
    expect(prompter.prompts).toHaveLength(0);
  });
});

describe("findPendingQuestion", () => {
  function message(
    id: string,
    role: ChatMessageWithParts["role"],
    parts: Array<Partial<ChatPartRow>>,
    hidden_at: number | null = null
  ): ChatMessageWithParts {
    return {
      id,
      session_id: "s",
      role,
      metadata: {},
      hidden_at,
      created_at: 0,
      updated_at: 0,
      parts: parts.map((p, index) => ({
        id: `${id}-${index}`,
        message_id: id,
        session_id: "s",
        index,
        type: "text",
        data: {},
        tool_call_id: null,
        tool_state: null,
        created_at: 0,
        updated_at: 0,
        ...p,
      })),
    };
  }

  const pendingPart = {
    type: "tool-question",
    tool_call_id: "q1",
    tool_state: "input-available",
    data: { input: { questions: [color] } },
  };

  it("finds the open question on the last assistant message", () => {
    expect(
      findPendingQuestion([
        message("u", "user", [{}]),
        message("a", "assistant", [{}, pendingPart]),
      ])
    ).toEqual({
      message_id: "a",
      tool_call_id: "q1",
      input: { questions: [color] },
    });
  });

  it("ignores answered questions and older messages", () => {
    expect(
      findPendingQuestion([
        message("a", "assistant", [
          { ...pendingPart, tool_state: "output-available" },
        ]),
      ])
    ).toBeNull();
    expect(
      findPendingQuestion([
        message("a", "assistant", [pendingPart]),
        message("u", "user", [{}]),
      ])
    ).toBeNull();
  });

  it("ignores rewound messages", () => {
    expect(
      findPendingQuestion([
        message("u", "user", [{}]),
        message("a", "assistant", [pendingPart], 1),
      ])
    ).toBeNull();
  });
});
