import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { toolOutputMedia } from "./tool-media";
import type { ToolCallEntry } from "@/lib/agent-chat";

/** A completed tool result entry (mirrors the AI SDK UIMessage tool part). */
function result(toolName: string, output: unknown): ToolCallEntry {
  return {
    type: `tool-${toolName}`,
    toolCallId: "1",
    input: { path: "/x.png" },
    output,
    state: "output-available",
  } as ToolCallEntry;
}

function srcOf(node: ReturnType<typeof toolOutputMedia>): string | undefined {
  if (!isValidElement(node)) return undefined;
  return (node as ReactElement<{ src?: string }>).props.src;
}

describe("toolOutputMedia", () => {
  it("renders a view_image result as an <img> with a data: URL (not JSON)", () => {
    const node = toolOutputMedia(
      result("view_image", {
        ok: true,
        mime: "image/png",
        width: 8,
        height: 8,
        bytes: 3,
        data: "AAAA",
      })
    );
    expect(isValidElement(node)).toBe(true);
    expect((node as ReactElement<{ alt?: string }>).type).toBe("img");
    expect(srcOf(node)).toBe("data:image/png;base64,AAAA");
  });

  it("falls back (null) for a non-image tool", () => {
    expect(
      toolOutputMedia(result("read_file", { ok: true, content: "x" }))
    ).toBeNull();
  });

  it("falls back (null) for a view_image ERROR result", () => {
    expect(
      toolOutputMedia(
        result("view_image", { ok: false, reason: "not_found", message: "no" })
      )
    ).toBeNull();
  });

  it("falls back (null) when the bytes were elided (no data) — e.g. a stale, retained result", () => {
    expect(
      toolOutputMedia(
        result("view_image", {
          ok: true,
          mime: "image/png",
          width: 8,
          height: 8,
          bytes: 3,
        })
      )
    ).toBeNull();
  });
});
