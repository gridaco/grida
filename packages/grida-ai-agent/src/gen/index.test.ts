/**
 * `AgentGen` — contract tests for the media-generation surface. The namespace
 * is pure (the host injects the generator), so these run with a fake generator
 * and assert the output-lowering + dispatcher contract — no provider, no I/O.
 * Each test name states the behavior it pins (the spec).
 */
import { describe, expect, it } from "vitest";
import { AgentGen } from "./index";

const OK: AgentGen.ImageGenOk = {
  ok: true,
  path: "/tmp/grida-agent/sessions/ses_x/scratch/image-1.png",
  mime: "image/png",
  width: 1024,
  height: 1024,
  bytes: 42,
};

describe("AgentGen.toModelOutput", () => {
  it("is generate-only: returns a text path descriptor, never inlines the image", () => {
    // generate_image is a producer, not a perception tool — a tool result can't
    // deliver pixels on the openai-compatible wire format (it would arrive as
    // base64 TEXT the model can't decode and would blow the context). So the
    // model-facing output is always a text descriptor naming the saved path.
    const lowered = AgentGen.toModelOutput(OK);
    expect(lowered.type).toBe("text");
    expect(lowered.value).toContain(OK.path);
    expect(lowered.value.toLowerCase()).toContain("scratch");
    // No base64 / media payload of any kind.
    expect(lowered.value.length).toBeLessThan(2000);
    expect(JSON.stringify(lowered)).not.toContain("media");
  });

  it("toModelOutput surfaces an error as plain text", () => {
    const lowered = AgentGen.toModelOutput({
      ok: false,
      reason: "unavailable",
      message: "No connected provider.",
    });
    expect(lowered).toEqual({ type: "text", value: "No connected provider." });
  });
});

describe("AgentGen.resolveToolCall", () => {
  const okGen: AgentGen.ImageGenerator = {
    async generate() {
      return OK;
    },
  };

  it("passes a valid call through to the injected generator", async () => {
    const out = await AgentGen.resolveToolCall(okGen, {
      tool_name: "generate_image",
      input: { prompt: "a red circle" },
    });
    expect(out).toBe(OK);
  });

  it("maps a missing prompt to a typed invalid_input refusal, not a throw", async () => {
    const out = await AgentGen.resolveToolCall(okGen, {
      tool_name: "generate_image",
      input: { prompt: "" },
    });
    expect(out).toMatchObject({ ok: false, reason: "invalid_input" });
  });

  it("returns undefined for a non-gen tool (resolvers chain)", async () => {
    const out = await AgentGen.resolveToolCall(okGen, {
      tool_name: "view_image",
      input: { path: "/x.png" },
    });
    expect(out).toBeUndefined();
  });

  it("returns undefined for a dynamic tool call", async () => {
    const out = await AgentGen.resolveToolCall(okGen, {
      tool_name: "generate_image",
      input: { prompt: "x" },
      dynamic: true,
    });
    expect(out).toBeUndefined();
  });
});
