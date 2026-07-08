import { describe, expect, it } from "vitest";
import {
  isGenerateImageEntry,
  isMediaPending,
  isMediaToolEntry,
  isViewImageEntry,
  mediaError,
  mediaImageSrc,
  mediaPath,
  mediaPrompt,
  mediaReferences,
} from "./tool-media";
import type { ToolCallEntry } from "@/lib/agent-chat";

/** A completed tool result entry (mirrors the AI SDK UIMessage tool part). */
function result(
  toolName: string,
  input: unknown,
  output: unknown
): ToolCallEntry {
  return {
    type: `tool-${toolName}`,
    toolCallId: "1",
    input,
    output,
    state: "output-available",
  } as ToolCallEntry;
}

describe("tool-media — recognition", () => {
  it("recognizes the image tools, and only those", () => {
    const v = result("view_image", { path: "/x.png" }, { ok: true });
    const g = result("generate_image", { prompt: "a cat" }, { ok: true });
    const r = result("read_file", { path: "/x" }, { ok: true });
    expect([isViewImageEntry(v), isGenerateImageEntry(g)]).toEqual([
      true,
      true,
    ]);
    expect([
      isMediaToolEntry(v),
      isMediaToolEntry(g),
      isMediaToolEntry(r),
    ]).toEqual([true, true, false]);
  });
});

describe("tool-media — view_image", () => {
  const ok = result(
    "view_image",
    { path: "/shots/a.png" },
    { ok: true, mime: "image/png", width: 8, height: 8, bytes: 3, data: "AAAA" }
  );

  it("path is the viewed input file; src is the data: URL; no prompt", () => {
    expect(mediaPath(ok)).toBe("/shots/a.png");
    expect(mediaImageSrc(ok)).toBe("data:image/png;base64,AAAA");
    expect(mediaPrompt(ok)).toBeUndefined();
  });

  it("error result: no src, surfaces the message (never JSON), path still shows", () => {
    const err = result(
      "view_image",
      { path: "/missing.png" },
      { ok: false, reason: "not_found", message: "No file at /missing.png." }
    );
    expect(mediaImageSrc(err)).toBeUndefined();
    expect(mediaError(err)).toBe("No file at /missing.png.");
    expect(mediaPath(err)).toBe("/missing.png");
  });
});

describe("tool-media — generate_image", () => {
  const ok = result(
    "generate_image",
    { prompt: "a wide lighthouse at dusk" },
    {
      ok: true,
      path: "/tmp/scratch/image-1.png",
      mime: "image/jpeg",
      bytes: 9,
      data: "BBBB",
    }
  );

  it("shows the prompt (input), the SAVED path (output), and the image", () => {
    expect(mediaPrompt(ok)).toBe("a wide lighthouse at dusk");
    expect(mediaPath(ok)).toBe("/tmp/scratch/image-1.png"); // from OUTPUT, not input
    expect(mediaImageSrc(ok)).toBe("data:image/jpeg;base64,BBBB");
  });

  it("extracts image-to-image references from input", () => {
    const withRefs = result(
      "generate_image",
      {
        prompt: "make it warmer",
        references: ["pins/a.png", "https://x/b.jpg", ""],
      },
      { ok: true }
    );
    expect(mediaReferences(withRefs)).toEqual([
      "pins/a.png",
      "https://x/b.jpg",
    ]);
    expect(
      mediaReferences(result("generate_image", { prompt: "x" }, { ok: true }))
    ).toEqual([]);
  });

  it("no src when bytes absent (model-only path) — prompt + path still show", () => {
    const noData = result(
      "generate_image",
      { prompt: "x" },
      { ok: true, path: "/tmp/scratch/y.png", mime: "image/png", bytes: 9 }
    );
    expect(mediaImageSrc(noData)).toBeUndefined();
    expect(mediaPrompt(noData)).toBe("x");
    expect(mediaPath(noData)).toBe("/tmp/scratch/y.png");
  });

  it("is pending while in flight (args sent, no result) — drives the pending prompt view", () => {
    const inflight = {
      type: "tool-generate_image",
      toolCallId: "1",
      input: { prompt: "a slow render" },
      state: "input-available",
    } as ToolCallEntry;
    expect(isMediaPending(inflight)).toBe(true);
    // The prompt is available to show in the placeholder while waiting.
    expect(mediaPrompt(inflight)).toBe("a slow render");
    // A settled result is not pending.
    expect(
      isMediaPending(result("generate_image", { prompt: "x" }, { ok: true }))
    ).toBe(false);
  });
});
