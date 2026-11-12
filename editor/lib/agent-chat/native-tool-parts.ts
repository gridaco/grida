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
      case "run_command":
        return { ...input, command: input.command ?? input.program };
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
      case "run_command":
        return {
          ...commandStreams(output.text),
          exit_code: exitCode(structured),
        };
      default:
        return Object.keys(structured).length
          ? structured
          : { text: output.text };
    }
  }

  /** The `stdout:` and `stderr:` sections of a command result. */
  export function commandStreams(text: string): {
    stdout?: string;
    stderr?: string;
  } {
    const streams: { stdout?: string; stderr?: string } = {};
    const sections = text.split(/^(stdout|stderr):\n/m);
    for (let index = 1; index < sections.length; index += 2) {
      const name = sections[index] as "stdout" | "stderr";
      streams[name] = sections[index + 1]?.replace(/\n$/, "");
    }
    return streams;
  }

  function exitCode(structured: Record<string, unknown>): number | undefined {
    const completion = record(structured.completion);
    return completion.kind === "exited" && typeof completion.code === "number"
      ? completion.code
      : undefined;
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
