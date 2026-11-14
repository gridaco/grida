import type { NativeChatActivity } from "@grida/desktop-bridge";
import type { ToolCallEntry } from "./types";

/**
 * Native tool calls as the chat kit's tool parts, so a native chat shows the
 * same tool cards as every other agent chat.
 *
 * The native agent names a few tools and fields differently from the kit's
 * cards, and returns results as text. This adapter renames those and reads
 * the result text into the fields the cards show; anything it does not
 * recognize passes through to the kit's generic card.
 */
export namespace native_tool_parts {
  /** Native tool names the kit knows under another name. */
  const NAMES: Readonly<Record<string, string>> = {
    search_text: "grep_files",
  };

  export function entry(call: NativeChatActivity): ToolCallEntry {
    const name = NAMES[call.title] ?? call.title;
    const input = normalizeInput(call.title, record(call.input));
    const base = {
      type: `tool-${name}`,
      toolCallId: call.callId,
      input,
    };
    if (call.outcome === "running")
      return { ...base, state: "input-available" } as ToolCallEntry;
    if (call.outcome === "succeeded")
      return {
        ...base,
        state: "output-available",
        output: normalizeOutput(call.title, call.output),
      } as ToolCallEntry;
    return {
      ...base,
      state: "output-error",
      errorText: call.output?.text || OUTCOME[call.outcome],
    } as ToolCallEntry;
  }

  const OUTCOME: Record<NativeChatActivity["outcome"], string> = {
    running: "Running",
    succeeded: "Done",
    failed: "Failed",
    cancelled: "Stopped",
    uncertain: "Not confirmed",
  };

  function normalizeInput(
    tool: string,
    input: Record<string, unknown>
  ): Record<string, unknown> {
    switch (tool) {
      case "exec_command":
        return { ...input, command: input.cmd };
      case "write_stdin":
        return {
          ...input,
          process_id: input.session_id,
          description: processAction(input),
        };
      case "search_text":
        return { ...input, pattern: input.pattern ?? input.query };
      default:
        return input;
    }
  }

  function normalizeOutput(
    tool: string,
    output: NativeChatActivity["output"]
  ): unknown {
    if (!output) return undefined;
    const structured = record(output.structured);
    switch (tool) {
      case "read_file":
        return { content: output.text, truncated: output.truncated };
      case "edit_file":
        return {
          ...structured,
          occurrences: structured.replacements ?? structured.occurrences,
        };
      case "list_files": {
        const entries = record(parse(output.text)).entries;
        return {
          files: Array.isArray(entries)
            ? entries.flatMap((entry) => {
                const item = record(entry);
                return typeof item.name === "string"
                  ? [item.kind === "directory" ? `${item.name}/` : item.name]
                  : [];
              })
            : undefined,
        };
      }
      case "search_text": {
        const matches = record(parse(output.text)).matches;
        return {
          matches: Array.isArray(matches)
            ? matches.map((match) => {
                const item = record(match);
                return { ...item, text: item.text ?? item.snippet };
              })
            : undefined,
        };
      }
      case "exec_command":
      case "write_stdin":
        return commandResult(output.text);
      default:
        return Object.keys(structured).length
          ? structured
          : { text: output.text };
    }
  }

  /** What a command result reports, in the fields the command card shows. */
  export type CommandResult = {
    /** Set when the command ended with an exit code. */
    exit_code?: number;
    /** Set when the command is still running as a background process. */
    process_id?: number;
    wall_time_seconds?: number;
    original_token_count?: number;
    output?: string;
  };

  /**
   * Reads a command result: a few header lines, then `Output:` and the text.
   *
   * ```text
   * Wall time: 1.2345 seconds
   * Process exited with code 0        (or: Process running with session ID 3)
   * Original token count: 12          (optional)
   * Output:
   * <text>
   * ```
   */
  export function commandResult(text: string): CommandResult {
    const marker = /^Output:\n/m.exec(text);
    const header = marker ? text.slice(0, marker.index) : text;
    const result: CommandResult = {};
    const wall = /^Wall time: (\d+(?:\.\d+)?) seconds$/m.exec(header);
    if (wall) result.wall_time_seconds = Number(wall[1]);
    const exited = /^Process exited with code (-?\d+)$/m.exec(header);
    if (exited) result.exit_code = Number(exited[1]);
    const running = /^Process running with session ID (\d+)$/m.exec(header);
    if (running) result.process_id = Number(running[1]);
    const tokens = /^Original token count: (\d+)$/m.exec(header);
    if (tokens) result.original_token_count = Number(tokens[1]);
    if (marker) {
      const output = text
        .slice(marker.index + marker[0].length)
        .replace(/\n$/, "");
      if (output) result.output = output;
    } else if (!wall && !exited && !running) {
      // Not a command report; show the text as it came.
      result.output = text;
    }
    return result;
  }

  /**
   * What a `write_stdin` call did to its process: an empty write only waits
   * for output, a lone Ctrl-C interrupts it, anything else is input.
   */
  export function processAction(input: Record<string, unknown>): string {
    const id =
      typeof input.session_id === "number" ? ` ${input.session_id}` : "";
    const chars = input.chars;
    if (chars === undefined || chars === "") return `checked process${id}`;
    if (chars === "\u0003") return `interrupted process${id}`;
    return `sent input to process${id}`;
  }

  function parse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
