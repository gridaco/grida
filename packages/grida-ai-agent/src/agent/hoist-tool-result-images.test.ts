import { describe, it, expect } from "vitest";
import type { ModelMessage } from "ai";
import {
  hoistToolResultImages,
  HOISTED_IMAGE_PLACEHOLDER,
} from "./hoist-tool-result-images";

// Doctrine: docs/wg/ai/agent/ai-sdk/vision-lowering.md (gridaco/grida#923).
// An image returned in a tool result is invisible to the model on the
// openai-compatible wire (the media block is stringified to base64 text), so
// the run loop hoists it into a following user-message image part. These cases
// pin that transform.

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA=";

/** The content `value` of a message's first tool-result part (narrowed). */
function firstToolContent(m: ModelMessage) {
  if (m.role !== "tool") throw new Error("expected a tool message");
  const [part] = m.content;
  if (part.type !== "tool-result" || part.output.type !== "content")
    throw new Error("expected a content tool-result");
  return part.output.value;
}

/** An assistant message that called `view_image`. */
function assistantToolCall(toolCallId: string): ModelMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId,
        toolName: "view_image",
        input: { path: "shot.png" },
      },
    ],
  };
}

/** A tool result carrying an image media block (what `toModelOutput` emits). */
function imageToolResult(toolCallId: string, extraText?: string): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName: "view_image",
        output: {
          type: "content",
          value: [
            ...(extraText ? [{ type: "text" as const, text: extraText }] : []),
            { type: "media", mediaType: "image/png", data: PNG_B64 },
          ],
        },
      },
    ],
  };
}

describe("hoistToolResultImages", () => {
  it("moves a live image tool result into a following user-message image part", () => {
    const out = hoistToolResultImages([
      { role: "user", content: "look at this" },
      assistantToolCall("c1"),
      imageToolResult("c1"),
    ]);

    // user, assistant, tool (neutralized), user(image)
    expect(out).toHaveLength(4);

    // The tool result no longer carries the base64 — it would be stringified.
    expect(out[2].role).toBe("tool");
    const toolOut = firstToolContent(out[2]);
    expect(JSON.stringify(toolOut)).not.toContain(PNG_B64);
    expect(toolOut).toEqual([
      { type: "text", text: HOISTED_IMAGE_PLACEHOLDER },
    ]);

    // A new user message carries the image as a vision-input part.
    const userImg = out[3];
    expect(userImg.role).toBe("user");
    expect(userImg.content).toEqual([
      { type: "image", image: PNG_B64, mediaType: "image/png" },
    ]);
  });

  it("keeps a tool result's own text alongside the hoist marker", () => {
    const out = hoistToolResultImages([
      assistantToolCall("c1"),
      imageToolResult("c1", "Image read successfully"),
    ]);
    expect(firstToolContent(out[1])).toEqual([
      { type: "text", text: "Image read successfully" },
      { type: "text", text: HOISTED_IMAGE_PLACEHOLDER },
    ]);
  });

  it("leaves an already-elided (text-only) tool result untouched", () => {
    const elided: ModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "view_image",
          output: {
            type: "content",
            value: [{ type: "text", text: "[image viewed earlier]" }],
          },
        },
      ],
    };
    const input = [assistantToolCall("c1"), elided];
    expect(hoistToolResultImages(input)).toEqual(input);
  });

  it("leaves a non-image tool result untouched", () => {
    const jsonResult: ModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "read_file",
          output: { type: "json", value: { ok: true } },
        },
      ],
    };
    const input = [jsonResult];
    expect(hoistToolResultImages(input)).toEqual(input);
  });

  it("hoists multiple image results in order", () => {
    const out = hoistToolResultImages([
      assistantToolCall("c1"),
      imageToolResult("c1"),
      assistantToolCall("c2"),
      imageToolResult("c2"),
    ]);
    // a, tool1, user-img1, a, tool2, user-img2
    expect(out.map((m) => m.role)).toEqual([
      "assistant",
      "tool",
      "user",
      "assistant",
      "tool",
      "user",
    ]);
  });

  it("is idempotent — a second pass changes nothing", () => {
    const once = hoistToolResultImages([
      assistantToolCall("c1"),
      imageToolResult("c1"),
    ]);
    expect(hoistToolResultImages(once)).toEqual(once);
  });
});
