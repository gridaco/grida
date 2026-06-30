import { describe, expect, it } from "vitest";
import {
  isViewImageEntry,
  viewImageError,
  viewImagePath,
  viewImageSrc,
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

const okOut = {
  ok: true,
  mime: "image/png",
  width: 8,
  height: 8,
  bytes: 3,
  data: "AAAA",
};

describe("tool-media (view_image)", () => {
  it("recognizes a view_image entry, and only that", () => {
    expect(isViewImageEntry(result("view_image", {}, okOut))).toBe(true);
    expect(isViewImageEntry(result("read_file", {}, { ok: true }))).toBe(false);
  });

  it("derives the data: URL from an ok result with bytes", () => {
    expect(viewImageSrc(result("view_image", { path: "/x.png" }, okOut))).toBe(
      "data:image/png;base64,AAAA"
    );
  });

  it("derives the viewed path from the input", () => {
    expect(
      viewImagePath(result("view_image", { path: "/shots/a.png" }, okOut))
    ).toBe("/shots/a.png");
  });

  it("has no src for an error result, but surfaces its message (never JSON)", () => {
    const err = result(
      "view_image",
      { path: "/missing.png" },
      {
        ok: false,
        reason: "not_found",
        message: "No file at /missing.png.",
      }
    );
    expect(viewImageSrc(err)).toBeUndefined();
    expect(viewImageError(err)).toBe("No file at /missing.png.");
    // The path still renders (so the row isn't empty) ...
    expect(viewImagePath(err)).toBe("/missing.png");
  });

  it("has no src when bytes were elided (ok but no data) — path still shows", () => {
    const { data: _dropped, ...noData } = okOut;
    const stale = result("view_image", { path: "/x.png" }, noData);
    expect(viewImageSrc(stale)).toBeUndefined();
    expect(viewImageError(stale)).toBeUndefined();
    expect(viewImagePath(stale)).toBe("/x.png");
  });
});
