import { describe, expect, it } from "vitest";
import { createQuestionTool, QUESTION_HEADLESS_REFUSAL } from "./question";

describe("createQuestionTool", () => {
  it("is client-resolved (NO execute) in an interactive host", () => {
    // Interactive: the human's answer IS the result, supplied via addToolResult.
    // Like the fs tools, the tool must ship without an `execute` so the call
    // pauses at `input-available` instead of resolving server-side.
    const tool = createQuestionTool({ interactive: true });
    expect(tool.execute).toBeUndefined();
  });

  it("ships a fixed-refusal execute in a headless host", async () => {
    // Headless (CI / scheduled / batch): no human to answer. The tool refuses
    // with a fixed tool error so the model gets it next turn and proceeds.
    const tool = createQuestionTool({ interactive: false });
    expect(tool.execute).toBeTypeOf("function");
    await expect(
      // The AI SDK passes (input, context); the refusal ignores both.
      (tool.execute as (input: unknown, ctx: unknown) => Promise<unknown>)(
        { questions: [{ question: "x?" }] },
        {}
      )
    ).rejects.toThrow(QUESTION_HEADLESS_REFUSAL);
  });

  it("accepts the RFC question shape and rejects an empty survey", () => {
    const tool = createQuestionTool({ interactive: true });
    const schema = tool.inputSchema as {
      safeParse: (v: unknown) => { success: boolean };
    };
    expect(
      schema.safeParse({
        questions: [
          {
            question: "Pick a color",
            header: "Color",
            options: [{ label: "Red", description: "warm" }, { label: "Blue" }],
            multi_select: false,
          },
        ],
      }).success
    ).toBe(true);
    // At least one question is required.
    expect(schema.safeParse({ questions: [] }).success).toBe(false);
  });
});
