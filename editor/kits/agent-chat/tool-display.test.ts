import { describe, expect, it } from "vitest";
import { toolDisplay } from "./tool-display";
import type { ToolCallEntry } from "@/lib/agent-chat";

describe("toolDisplay", () => {
  it("summarizes mixed tool chunks in stable product copy", () => {
    expect(
      toolDisplay.summarize([
        tool("1", "edit_file", { path: "/src/a.ts" }),
        tool("2", "read_file", { path: "/src/b.ts" }),
        tool("3", "run_command", {
          command: "pnpm",
          args: ["typecheck"],
          description: "Typecheck editor",
        }),
      ])
    ).toBe("Edited 1 file, read 1 file, ran 1 command");
  });

  it("uses agent-provided command descriptions before argv", () => {
    expect(
      toolDisplay.describe(
        tool("1", "run_command", {
          command: "pnpm",
          args: ["test"],
          description: "Run agent sidecar tests",
        })
      )
    ).toMatchObject({
      action: "command",
      title: "Ran command",
      detail: "Run agent sidecar tests",
    });
  });

  it("counts distinct files instead of repeated file tool calls", () => {
    expect(
      toolDisplay.summarize([
        tool("1", "edit_file", { path: "/src/a.ts" }),
        tool("2", "edit_file", { path: "/src/a.ts" }),
        tool("3", "edit_file", { path: "/src/b.ts" }),
      ])
    ).toBe("Edited 2 files");
  });

  it("describes tool input streaming before final input or output", () => {
    expect(
      toolDisplay.describe({
        type: "tool-read_file",
        toolCallId: "1",
        state: "input-streaming",
        input: undefined,
      } as ToolCallEntry)
    ).toMatchObject({
      action: "read",
      title: "Reading file",
      tone: "running",
    });
  });

  it("labels image tools with media-specific actions", () => {
    expect(
      toolDisplay.describe(
        tool("1", "view_image", { path: "/assets/logo.png" })
      )
    ).toMatchObject({
      action: "view_image",
      title: "Viewed image",
      detail: "logo.png",
    });

    expect(
      toolDisplay.describe(
        tool("2", "generate_image", {
          prompt: "A small luminous square logo mark",
        })
      )
    ).toMatchObject({
      action: "generate_image",
      title: "Generated image",
      detail: "A small luminous square logo mark",
    });
  });

  it("labels skill loading as a dedicated action", () => {
    expect(
      toolDisplay.describe(tool("1", "skill", { name: "slides" }))
    ).toMatchObject({
      action: "skill",
      title: "Loaded skill",
      detail: "slides",
    });

    expect(
      toolDisplay.summarize([
        tool("1", "skill", { name: "slides" }),
        tool("2", "skill", { name: "pdf" }),
      ])
    ).toBe("Loaded 2 skills");
  });
});

function tool(id: string, toolName: string, input: unknown): ToolCallEntry {
  return {
    type: `tool-${toolName}`,
    toolCallId: id,
    input,
    output: { ok: true },
    state: "output-available",
  } as ToolCallEntry;
}
