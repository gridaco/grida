import { describe, expect, it, vi } from "vitest";
import type { FileUIPart } from "ai";
import { USER_FILE_ATTACHMENTS, USER_TEMPLATE_SELECTION } from "@grida/agent";
import {
  buildAgentSend,
  buildTemplateContext,
  type SendMessageFn,
} from "./build-agent-send";

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

  it("omits mode from the body when not provided", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "m1",
    })("hi");
    expect(
      "mode" in (sendMessage.mock.calls[0][1] as { body: object }).body
    ).toBe(false);
  });
});

describe("buildAgentSend — endpoint provider pin (#806)", () => {
  it("rides provider_id when the picked model is a registered endpoint model", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    const send = buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "llama3.1:8b",
      providerId: "ollama",
    });

    send("hi");

    expect(sendMessage).toHaveBeenCalledWith(
      { text: "hi" },
      {
        body: {
          session_id: "s1",
          model_id: "llama3.1:8b",
          provider_id: "ollama",
        },
      }
    );
  });

  it("omits provider_id for catalog models (BYOK cascade stays in charge)", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    const send = buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "anthropic/claude-sonnet-4.6",
    });

    send("hi");

    const body = sendMessage.mock.calls[0][1]?.body;
    expect(body).not.toHaveProperty("provider_id");
  });
});

describe("buildAgentSend — context token parts (WG compositor.md §templating)", () => {
  it("attaches contexts as {role, parts} beside the honest text, keeping scratch_seed in the body", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    const send = buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "m1",
      scratchSeed: [{ path: ".canvas.json", text: "{}" }],
      contexts: buildTemplateContext({
        title: "Startup Pitch",
        slides: 12,
        system: "obsidian",
      }),
    });

    send("make it about Q3");

    // The mock is typed to the `{text, files}` arm; at runtime buildAgentSend
    // sends the `{role, parts}` arm (cast `as never` in the impl), so read the
    // recorded value through `unknown`.
    const message = sendMessage.mock.calls[0][0] as unknown as {
      role: string;
      parts: Array<{ type: string; text?: string }>;
    };
    const options = sendMessage.mock.calls[0][1];
    // ARM 1 `{role, parts}` — the user text is a SIBLING part, not fabricated.
    expect(message.role).toBe("user");
    expect(message.parts[0]).toEqual({
      type: "text",
      text: "make it about Q3",
    });
    expect(message.parts[1]?.type).toBe(USER_TEMPLATE_SELECTION);
    // The scratch seed still rides the body on the same (first) turn.
    expect(options?.body?.scratch_seed).toEqual([
      { path: ".canvas.json", text: "{}" },
    ]);
  });

  it("sends a context-only message when the user typed nothing (zero fabricated text)", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "m1",
      contexts: buildTemplateContext({ title: "Portfolio", slides: 9 }),
    })("");

    const message = sendMessage.mock.calls[0][0] as unknown as {
      role: string;
      parts: Array<{ type: string }>;
    };
    expect(message.role).toBe("user");
    // No text part at all — nothing the user didn't type.
    expect(message.parts).toHaveLength(1);
    expect(message.parts[0]?.type).toBe(USER_TEMPLATE_SELECTION);
  });

  it("leaves the no-context path on the {text, files} arm (unchanged)", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    buildAgentSend({ sendMessage, sessionId: "s1", modelId: "m1" })("hi");
    expect(sendMessage).toHaveBeenCalledWith(
      { text: "hi" },
      { body: { session_id: "s1", model_id: "m1" } }
    );
  });

  it("merges per-turn attachment bytes and durable descriptors with closure context", () => {
    const sendMessage = vi.fn<SendMessageFn>();
    const send = buildAgentSend({
      sendMessage,
      sessionId: "s1",
      modelId: "m1",
      scratchSeed: [{ path: "template.canvas", text: "{}" }],
      contexts: buildTemplateContext({ title: "Pitch", slides: 4 }),
    });

    send("inspect it", undefined, {
      scratchSeed: [{ path: "upload-report.pdf", base64: "AQID" }],
      contexts: [
        {
          type: USER_FILE_ATTACHMENTS,
          data: {
            location: "scratch",
            files: [
              {
                name: "Report.pdf",
                mime: "application/pdf",
                size: 3,
                path: "upload-report.pdf",
              },
            ],
          },
        },
      ],
    });

    const message = sendMessage.mock.calls[0][0] as {
      role: string;
      parts: Array<{ type: string }>;
    };
    expect(message.parts.map((part) => part.type)).toEqual([
      "text",
      USER_TEMPLATE_SELECTION,
      USER_FILE_ATTACHMENTS,
    ]);
    expect(sendMessage.mock.calls[0][1]?.body?.scratch_seed).toEqual([
      { path: "template.canvas", text: "{}" },
      { path: "upload-report.pdf", base64: "AQID" },
    ]);
  });
});

describe("buildTemplateContext", () => {
  it("maps template metadata to one USER_TEMPLATE_SELECTION part with a lean payload", () => {
    expect(
      buildTemplateContext({
        title: "Startup Pitch",
        slides: 12,
        system: "obsidian",
      })
    ).toEqual([
      {
        type: USER_TEMPLATE_SELECTION,
        data: {
          title: "Startup Pitch",
          slides: 12,
          system: "obsidian",
          bundle_location: "scratch",
        },
      },
    ]);
  });

  it("omits system when absent, and returns [] for no metadata", () => {
    expect(
      buildTemplateContext({ title: "Portfolio", slides: 9 })[0].data
    ).not.toHaveProperty("system");
    expect(buildTemplateContext(undefined)).toEqual([]);
  });
});
