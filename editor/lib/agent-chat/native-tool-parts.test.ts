import { describe, expect, it } from "vitest";
import type { NativeChatActivity } from "@grida/desktop-bridge";
import { native_tool_parts } from "./native-tool-parts";

function call(
  title: string,
  input: unknown,
  output?: NativeChatActivity["output"],
  outcome: NativeChatActivity["outcome"] = "succeeded"
): NativeChatActivity {
  return {
    callId: `call-${title}`,
    title,
    kind: "other",
    outcome,
    input,
    ...(output && { output }),
  };
}

describe("native_tool_parts", () => {
  it("shows a read with the file content the card counts", () => {
    const part = native_tool_parts.entry(
      call(
        "read_file",
        { path: "src/cart.js" },
        {
          text: "a\nb\n",
          truncated: false,
        }
      )
    );
    expect(part).toMatchObject({
      type: "tool-read_file",
      toolCallId: "call-read_file",
      state: "output-available",
      input: { path: "src/cart.js" },
      output: { content: "a\nb\n" },
    });
  });

  it("shows a command line with its exit code and output", () => {
    const part = native_tool_parts.entry(
      call(
        "exec_command",
        { cmd: "npm test", workdir: "/fixture/workspace" },
        {
          text: "Wall time: 1.2345 seconds\nProcess exited with code 0\nOriginal token count: 12\nOutput:\n7 passed\nwarning\n",
          truncated: false,
        }
      )
    );
    expect(part).toMatchObject({
      type: "tool-exec_command",
      input: { command: "npm test", workdir: "/fixture/workspace" },
      output: {
        exit_code: 0,
        wall_time_seconds: 1.2345,
        original_token_count: 12,
        output: "7 passed\nwarning",
      },
    });
    expect(part).not.toHaveProperty("output.process_id");
  });

  it("reads a command that kept running as a background process", () => {
    expect(
      native_tool_parts.commandResult(
        "Wall time: 10.0001 seconds\nProcess running with session ID 3\nOutput:\nready on :3000\n"
      )
    ).toEqual({
      wall_time_seconds: 10.0001,
      process_id: 3,
      output: "ready on :3000",
    });
    expect(
      native_tool_parts.commandResult(
        "Wall time: 0.5 seconds\nProcess exited with code 2\nOutput:\n"
      )
    ).toEqual({ wall_time_seconds: 0.5, exit_code: 2 });
    // Output that itself mentions the marker keeps everything after the first.
    expect(
      native_tool_parts.commandResult(
        "Wall time: 1 seconds\nProcess exited with code 0\nOutput:\nOutput:\nx"
      ).output
    ).toBe("Output:\nx");
  });

  it.each([
    [{ session_id: 3, chars: "" }, "checked process 3"],
    [{ session_id: 3 }, "checked process 3"],
    [{ session_id: 3, chars: "\u0003" }, "interrupted process 3"],
    [{ session_id: 3, chars: "q\n" }, "sent input to process 3"],
  ])("names a write to a process by what it did %#", (input, action) => {
    const part = native_tool_parts.entry(
      call("write_stdin", input, {
        text: "Wall time: 0.2 seconds\nProcess running with session ID 3\nOutput:\n",
        truncated: false,
      })
    );
    expect(part).toMatchObject({
      type: "tool-write_stdin",
      input: { process_id: 3, description: action },
      output: { process_id: 3 },
    });
  });

  it("maps a text search and its matches onto the search card", () => {
    const part = native_tool_parts.entry(
      call(
        "search_text",
        { query: "HERON" },
        {
          text: JSON.stringify({
            matches: [{ path: "src/config.js", line: 1, snippet: "HERON" }],
            truncated: false,
          }),
          truncated: false,
        }
      )
    );
    expect(part).toMatchObject({
      type: "tool-grep_files",
      input: { pattern: "HERON" },
      output: { matches: [{ path: "src/config.js", line: 1, text: "HERON" }] },
    });
  });

  it("lists entries, marking folders", () => {
    const part = native_tool_parts.entry(
      call(
        "list_files",
        {},
        {
          text: JSON.stringify({
            entries: [
              { name: "src", kind: "directory" },
              { name: "README.md", kind: "file" },
            ],
          }),
          truncated: false,
        }
      )
    );
    expect(part).toMatchObject({ output: { files: ["src/", "README.md"] } });
  });

  it("reports running and unsuccessful calls in the kit's states", () => {
    expect(
      native_tool_parts.entry(call("read_file", {}, undefined, "running"))
    ).toMatchObject({ state: "input-available" });
    expect(
      native_tool_parts.entry(
        call(
          "exec_command",
          { cmd: "git status" },
          { text: "command_preparation_refused", truncated: false },
          "failed"
        )
      )
    ).toMatchObject({
      state: "output-error",
      errorText: "command_preparation_refused",
    });
  });

  it("passes unknown tools through to the generic card", () => {
    expect(
      native_tool_parts.entry(
        call(
          "goal_inspect",
          {},
          { text: "Captured goal state", truncated: false }
        )
      )
    ).toMatchObject({
      type: "tool-goal_inspect",
      output: { text: "Captured goal state" },
    });
  });
});
