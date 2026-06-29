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
  data: "iVBORw0KGgo=",
};

describe("AgentGen.toModelOutput", () => {
  it("generate_image lowers a produced image to a media block (model sees its output)", () => {
    const lowered = AgentGen.toModelOutput(OK);
    expect(lowered.type).toBe("content");
    if (lowered.type !== "content") throw new Error("unreachable");
    // A media block carries the pixels...
    const media = lowered.value.find((v) => v.type === "media");
    expect(media).toEqual({
      type: "media",
      mediaType: "image/png",
      data: "iVBORw0KGgo=",
    });
    // ...and a text line names the saved path so the model can promote it.
    const text = lowered.value.find((v) => v.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    expect(text?.text).toContain(OK.path);
  });

  it("toModelOutput names the path when data is elided (retention)", () => {
    const { data: _dropped, ...elided } = OK;
    const lowered = AgentGen.toModelOutput(elided);
    expect(lowered.type).toBe("text");
    if (lowered.type !== "text") throw new Error("unreachable");
    // No pixels re-sent, but the path survives so promotion is still possible.
    expect(lowered.value).toContain(OK.path);
    expect(lowered.value.toLowerCase()).toContain("view_image");
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
