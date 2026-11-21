import { describe, expect, it } from "vitest";
import { toolDisplay } from "./tool-display";
import type { ToolCallEntry } from "@/lib/agent-chat/types";
import type {
  NativeChatActivityOutcome,
  NativeChatCommandAction,
} from "@grida/desktop-bridge";
import { native_tool_parts } from "@/lib/agent-chat/native-tool-parts";

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

  it.each([
    {
      command: "cat src/README.md",
      actions: [{ kind: "read", path: "src/README.md" }],
      outcome: "running",
      action: "read",
      title: "Reading README.md",
      tone: "running",
    },
    {
      command: "rg TODO src",
      actions: [{ kind: "search", query: "TODO", path: "src" }],
      outcome: "succeeded",
      action: "search",
      title: "Searched for TODO in src",
      tone: "ok",
    },
    {
      command: "rg --files src | head -n 20",
      actions: [{ kind: "list_files", path: "src" }],
      outcome: "succeeded",
      action: "list",
      title: "Listed files in src",
      tone: "ok",
    },
    {
      command: "cat missing.md",
      actions: [{ kind: "read", path: "missing.md" }],
      outcome: "failed",
      action: "read",
      title: "Failed to read missing.md",
      tone: "error",
    },
  ] as const)(
    "describes $command as $title",
    ({ command, actions, outcome, action, title, tone }) => {
      const entry = shell(command, actions, outcome);
      expect(entry).toMatchObject({
        type: "tool-exec_command",
        input: { command },
      });
      expect(toolDisplay.describe(entry)).toMatchObject({
        action,
        title,
        tone,
      });
    }
  );

  it("keeps a failed compound command as one call and preserves action order", () => {
    const entry = shell(
      "cat missing.md && rg TODO src",
      [
        { kind: "read", path: "missing.md" },
        { kind: "search", query: "TODO", path: "src" },
      ],
      "failed"
    );
    expect(toolDisplay.describe(entry)).toMatchObject({
      action: "command",
      title: "Command failed",
      detail: "read missing.md, search for TODO in src",
      tone: "error",
    });
    expect(toolDisplay.summarize([entry])).toBe("Failed to run 1 command");
  });

  it("describes a pipeline without claiming its list or search succeeded", () => {
    const entry = shell(
      "rg --files missing | head",
      [{ kind: "list_files", path: "missing", piped: true }],
      "succeeded"
    );
    expect(toolDisplay.describe(entry)).toMatchObject({
      action: "command",
      title: "Ran command",
      detail: "list files in missing",
    });
    expect(toolDisplay.summarize([entry])).toBe("Ran 1 command");
  });

  it.each([
    ["cancelled", "Command stopped"],
    ["uncertain", "Command outcome unconfirmed"],
  ] as const)(
    "keeps the %s outcome on a classified command",
    (outcome, title) => {
      const entry = shell(
        "cat README.md",
        [{ kind: "read", path: "README.md" }],
        outcome
      );
      expect(toolDisplay.describe(entry)).toMatchObject({
        title,
        detail: "read README.md",
        tone: "error",
      });
    }
  );

  it("keeps a command that returned a session ID in the command display", () => {
    const entry = native_tool_parts.entry({
      callId: "background",
      kind: "execute",
      title: "exec_command",
      outcome: "succeeded",
      input: { cmd: "cat README.md" },
      commandActions: [{ kind: "read", path: "README.md" }],
      output: {
        text: "Wall time: 0.25 seconds\nProcess running with session ID 3\nOutput:\n",
        truncated: false,
      },
    });
    expect(toolDisplay.describe(entry)).toMatchObject({
      action: "command",
      title: "Ran command",
      detail: "cat README.md",
    });
  });

  it("uses exploration verbs in a collapsed group of commands", () => {
    expect(
      toolDisplay.summarize([
        shell(
          "rg TODO src",
          [{ kind: "search", query: "TODO", path: "src" }],
          "succeeded"
        ),
        shell("ls src", [{ kind: "list_files", path: "src" }], "succeeded"),
      ])
    ).toBe("Listed files, searched files");
  });

  it("counts one read target across repeated commands in the same working directory", () => {
    const read = (workdir: string) =>
      shell(
        "cat README.md",
        [{ kind: "read", path: "README.md" }],
        "succeeded",
        { workdir }
      );
    expect(toolDisplay.summarize([read("/a"), read("/a")])).toBe("Read 1 file");
    expect(toolDisplay.summarize([read("/a"), read("/b")])).toBe(
      "Read 2 files"
    );
  });

  it("keeps legacy commands generic even with model-supplied display fields", () => {
    const entry = native_tool_parts.entry({
      callId: "legacy",
      kind: "execute",
      title: "exec_command",
      outcome: "succeeded",
      input: {
        cmd: "cat README.md",
        commandActions: [{ kind: "read", path: "README.md" }],
      },
    });
    expect(toolDisplay.describe(entry)).toMatchObject({
      action: "command",
      title: "Ran command",
      detail: "cat README.md",
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

  it("labels current and historical skill reads as skill loading", () => {
    expect(
      toolDisplay.describe(tool("1", "read_skill", { name: "slides" }))
    ).toMatchObject({
      action: "skill",
      title: "Loaded skill",
      detail: "slides",
    });

    expect(
      toolDisplay.summarize([
        tool("1", "read_skill", { name: "slides" }),
        tool("2", "skill", { name: "pdf" }),
      ])
    ).toBe("Loaded 2 skills");
  });

  it("shows the tool search query and summarizes discovery separately", () => {
    const input = { query: "open a page" };
    expect(
      toolDisplay.describe(runningTool("1", "tool_search", input))
    ).toMatchObject({
      action: "tool_search",
      title: "Searching tools",
      detail: "open a page",
    });
    expect(toolDisplay.summarize([tool("1", "tool_search", input)])).toBe(
      "Searched tools"
    );
  });
});

function shell(
  command: string,
  commandActions: readonly NativeChatCommandAction[],
  outcome: NativeChatActivityOutcome,
  input?: { workdir?: string; directory?: string }
) {
  return native_tool_parts.entry({
    callId: "shell",
    kind: "execute",
    title: "exec_command",
    outcome,
    input: { cmd: command, ...input },
    commandActions,
  });
}

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
