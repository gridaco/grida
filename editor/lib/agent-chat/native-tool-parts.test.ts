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

  it("names a command by its program and reads its streams and exit code", () => {
    const part = native_tool_parts.entry(
      call(
        "run_command",
        { program: "npm", args: ["test"] },
        {
          text: "stdout:\n7 passed\nstderr:\nwarning\n",
          truncated: false,
          structured: { completion: { kind: "exited", code: 0 } },
        }
      )
    );
    expect(part).toMatchObject({
      input: { command: "npm", args: ["test"] },
      output: { stdout: "7 passed", stderr: "warning", exit_code: 0 },
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
          "run_command",
          { program: "git" },
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
