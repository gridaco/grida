import { describe, expect, it, vi } from "vitest";
import type { FileUIPart } from "ai";
import { buildAgentSend, type SendMessageFn } from "./build-agent-send";

const filepart: FileUIPart = {
  type: "file",
  mediaType: "image/png",
  url: "data:image/png;base64,AAAA",
  filename: "a.png",
};

describe("buildAgentSend", () => {
  it("sends text-only with the run body (session_id resolved from null)", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    const send = buildAgentSend({
      sendMessage,
      sessionId: null,
      modelId: "anthropic/claude-sonnet-4.6",
    });

    send("hello");

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      { text: "hello" },
      {
        body: {
          session_id: undefined,
          model_id: "anthropic/claude-sonnet-4.6",
        },
      }
    );
  });

  it("threads inline image files onto the message when present", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    const send = buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "m1",
    });

    send("look", [filepart]);

    expect(sendMessage).toHaveBeenCalledWith(
      { text: "look", files: [filepart] },
      { body: { session_id: "s1", model_id: "m1" } }
    );
  });

  it("omits files when the array is empty (no empty files key on the wire)", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    const send = buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "m1",
    });

    send("hi", []);

    expect(sendMessage).toHaveBeenCalledWith(
      { text: "hi" },
      { body: { session_id: "s1", model_id: "m1" } }
    );
  });

  it("includes skills in the body only when provided", () => {
    const withSkills = vi.fn<SendMessageFn>();
    buildAgentSend({
      sendMessage: withSkills,
      sessionId: "s1",
      modelId: "m1",
      skills: ["a", "b"],
    })("hi");
    expect(withSkills).toHaveBeenCalledWith(
      { text: "hi" },
      { body: { session_id: "s1", model_id: "m1", skills: ["a", "b"] } }
    );

    const withoutSkills = vi.fn<SendMessageFn>();
    buildAgentSend({
      sendMessage: withoutSkills,
      sessionId: "s1",
      modelId: "m1",
    })("hi");
    expect(withoutSkills.mock.calls[0][1]).toEqual({
      body: { session_id: "s1", model_id: "m1" },
    });
    expect(
      "skills" in (withoutSkills.mock.calls[0][1] as { body: object }).body
    ).toBe(false);
  });
});
