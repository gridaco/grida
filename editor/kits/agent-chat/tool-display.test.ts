import { describe, expect, it } from "vitest";
import { toolDisplay } from "./tool-display";
import type { ToolCallEntry } from "@/lib/agent-chat/types";

describe("toolDisplay", () => {
  it("summarizes mixed tool chunks in stable product copy", () => {
    expect(
      toolDisplay.summarize([
        tool("1", "edit_file", { path: "/src/a.ts" }),
        tool("2", "read_file", { path: "/src/b.ts" }),
        tool("3", "exec_command", {
          command: "pnpm",
          args: ["typecheck"],
          description: "Typecheck editor",
        }),
      ])
    ).toBe("Ran 1 command, read 1 file, edited 1 file");
  });

  it("uses one frequency ranking for the icon and every summary clause", () => {
    expect(
      toolDisplay.group([
        tool("1", "edit_file", { path: "/a.ts" }),
        tool("2", "read_file", { path: "/b.ts" }),
        tool("3", "edit_file", { path: "/a.ts" }),
        tool("4", "read_file", { path: "/c.ts" }),
        tool("5", "edit_file", { path: "/a.ts" }),
        tool("6", "exec_command", { command: "pnpm test" }),
      ])
    ).toEqual({
      action: "edit",
      summary: "Edited 1 file, read 2 files, ran 1 command",
    });
  });

  it("breaks frequency ties by the most recent call without reordering the calls", () => {
    const entries = [
      tool("1", "read_file", { path: "/a.ts" }),
      tool("2", "edit_file", { path: "/b.ts" }),
      tool("3", "read_file", { path: "/c.ts" }),
      tool("4", "edit_file", { path: "/d.ts" }),
    ];
    expect(toolDisplay.group(entries)).toEqual({
      action: "edit",
      summary: "Edited 2 files, read 2 files",
    });
    expect(entries.map((entry) => entry.toolCallId)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(toolDisplay.group(entries.slice(0, 3))).toEqual({
      action: "read",
      summary: "Read 2 files, edited 1 file",
    });
  });

  it("keeps running and failed work honest in the same ranked action group", () => {
    expect(
      toolDisplay.group([
        tool("1", "edit_file", { path: "/a.ts" }),
        tool("2", "edit_file", { path: "/b.ts" }, { ok: false }),
        runningTool("3", "edit_file", { path: "/c.ts" }),
        tool("4", "read_file", { path: "/d.ts" }),
      ])
    ).toEqual({
      action: "edit",
      summary:
        "Edited 1 file, editing 1 file, failed to edit 1 file, read 1 file",
    });
    expect(toolDisplay.group([])).toEqual({
      action: "tool",
      summary: "No tool calls",
    });
  });

  it("counts a listing's folders apart from its files", () => {
    const listing = (files: string[]) =>
      toolDisplay.describe(tool("1", "list_files", {}, { files })).detail;
    expect(listing(["src/", "assets/", "README.md"])).toBe("1 file, 2 folders");
    expect(listing(["src/"])).toBe("1 folder");
    expect(listing([])).toBe("0 files");
  });

  it("uses agent-provided command descriptions before argv", () => {
    expect(
      toolDisplay.describe(
        tool("1", "exec_command", {
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

  it("names a write to a background process by what it did", () => {
    expect(
      toolDisplay.describe(
        tool("1", "write_stdin", {
          session_id: 3,
          chars: "",
          description: "checked process 3",
        })
      )
    ).toMatchObject({ action: "process", title: "Checked process 3" });
    expect(
      toolDisplay.summarize([
        tool("1", "exec_command", { command: "pnpm dev" }),
        tool("2", "write_stdin", { description: "checked process 3" }),
        tool("3", "write_stdin", { description: "interrupted process 3" }),
      ])
    ).toBe("Used 2 processes, ran 1 command");
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

  it("does not describe a rejected write as successful", () => {
    expect(
      toolDisplay.describe(
        tool(
          "1",
          "write_file",
          { path: "/__references__/dir_123/marker.txt" },
          {
            ok: false,
            reason: "read_only",
            message: "Attached folders are read only.",
          }
        )
      )
    ).toMatchObject({
      action: "write",
      title: "Failed to write file",
      detail: "marker.txt",
      tone: "warn",
    });
  });

  it("does not count failed or running tools as completed work", () => {
    expect(
      toolDisplay.summarize([
        tool("1", "edit_file", { path: "/src/a.ts" }),
        tool("2", "write_file", { path: "/src/b.ts" }, { ok: false }),
        {
          type: "tool-read_file",
          toolCallId: "3",
          state: "input-available",
          input: { path: "/src/c.ts" },
        } as ToolCallEntry,
      ])
    ).toBe("Reading 1 file, failed to write 1 file, edited 1 file");
  });

  it("labels tool protocol errors as failures", () => {
    expect(
      toolDisplay.describe({
        type: "tool-exec_command",
        toolCallId: "1",
        state: "output-error",
        input: { command: "pnpm", args: ["typecheck"] },
        errorText: "Process failed",
      } as ToolCallEntry)
    ).toMatchObject({
      action: "command",
      title: "Command failed",
      tone: "error",
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

  it("treats design search as a user-driven reference picker", () => {
    expect(
      toolDisplay.describe(
        runningTool("1", "design_search", {
          initial_search_query: "vivid editorial poster",
        })
      )
    ).toMatchObject({
      action: "pick_references",
      title: "Picking references",
      detail: "vivid editorial poster",
    });

    expect(
      toolDisplay.describe(
        tool("2", "design_search", {
          initial_search_query: "vivid editorial poster",
        })
      )
    ).toMatchObject({
      action: "pick_references",
      title: "Picked references",
      detail: undefined,
    });

    expect(
      toolDisplay.summarize([
        runningTool("3", "design_search", {
          initial_search_query: "vivid editorial poster",
        }),
      ])
    ).toBe("Picking references");

    expect(
      toolDisplay.summarize([
        tool("4", "design_search", {
          initial_search_query: "vivid editorial poster",
        }),
      ])
    ).toBe("Picked references");
  });

  it("summarizes parallel image generation as the work being done", () => {
    expect(
      toolDisplay.summarize([
        runningTool("1", "generate_image", { prompt: "A product still life" }),
        runningTool("2", "generate_image", { prompt: "An editorial poster" }),
      ])
    ).toBe("Generating 2 images");
  });

  it("labels host presentation tools as tabs", () => {
    expect(
      toolDisplay.describe(
        tool(
          "1",
          "surface_open",
          { path: "/campaign.canvas" },
          {
            path: "/campaign.canvas",
            requested: true,
            reason: "requested",
          }
        )
      )
    ).toMatchObject({
      action: "open_tab",
      title: "Opened tab",
      detail: "campaign.canvas",
    });

    expect(
      toolDisplay.describe(
        tool(
          "2",
          "surface_list_open",
          {},
          {
            interactive: true,
            active: "/campaign.canvas",
            open: ["/campaign.canvas", "/brief.md"],
          }
        )
      )
    ).toMatchObject({
      action: "list_tabs",
      title: "Checked open tabs",
      detail: "2 tabs",
    });
  });

  it("does not claim a tab opened when no presentation host is attached", () => {
    expect(
      toolDisplay.describe(
        tool(
          "1",
          "surface_open",
          { path: "/campaign.canvas" },
          {
            path: "/campaign.canvas",
            requested: false,
            reason: "not_interactive",
          }
        )
      )
    ).toMatchObject({
      action: "open_tab",
      title: "Couldn’t open tab",
      tone: "warn",
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

function tool(
  id: string,
  toolName: string,
  input: unknown,
  output: unknown = { ok: true }
): ToolCallEntry {
  return {
    type: `tool-${toolName}`,
    toolCallId: id,
    input,
    output,
    state: "output-available",
  } as ToolCallEntry;
}

function runningTool(
  id: string,
  toolName: string,
  input: unknown
): ToolCallEntry {
  return {
    type: `tool-${toolName}`,
    toolCallId: id,
    input,
    state: "input-available",
  } as ToolCallEntry;
}
