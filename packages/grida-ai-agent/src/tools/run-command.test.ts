import { describe, expect, it, vi } from "vitest";
import { createRunCommandTool, type RunCommandBackend } from "./run-command";

describe("createRunCommandTool", () => {
  it("forwards the AI SDK turn abort signal to the command backend", async () => {
    const backend = vi.fn<RunCommandBackend>(async () => ({
      stdout: "",
      stderr: "",
      exit_code: 0,
      signal: null,
      timed_out: false,
      truncated: false,
    }));
    const command = createRunCommandTool({
      backend,
      default_workdir: "/workspace",
    });
    const controller = new AbortController();

    await command.execute!(
      {
        command: "pwd",
        args: [],
        description: "print the working directory",
      },
      {
        toolCallId: "tool-call-1",
        messages: [],
        abortSignal: controller.signal,
      }
    );

    expect(backend).toHaveBeenCalledWith(
      {
        command: "pwd",
        args: [],
        workdir: "/workspace",
        timeout_ms: undefined,
        description: "print the working directory",
      },
      controller.signal
    );
  });
});
