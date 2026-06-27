import { AgentFs } from "@grida/agent/fs";
import { AgentTodos } from "@grida/agent/todos";
import { getToolName } from "ai";
import type { ToolCallEntry } from "@/lib/agent-chat";

export type ToolDisplayAction =
  | "read"
  | "edit"
  | "write"
  | "list"
  | "search"
  | "plan"
  | "command"
  | "question"
  | "tool";

export type ToolDisplayTone = "running" | "ok" | "warn" | "error";

export type ToolDisplayDescription = {
  action: ToolDisplayAction;
  title: string;
  detail?: string;
  target?: string;
  tone: ToolDisplayTone;
};

export namespace toolDisplay {
  export function describe(entry: ToolCallEntry): ToolDisplayDescription {
    const toolName = getToolName(entry);
    const input = readToolInput(entry);
    const args = asRecord(input);
    const path = stringValue(args.path);
    const tone = describeTone(entry);

    switch (toolName) {
      case AgentFs.TOOL_NAMES.read_file:
        return {
          action: "read",
          title: isActive(entry) ? "Reading file" : "Read file",
          detail: shortPath(path),
          target: path,
          tone,
        };

      case AgentFs.TOOL_NAMES.edit_file:
        return {
          action: "edit",
          title: isActive(entry) ? "Editing file" : "Edited file",
          detail: describeEditDetail(entry, path),
          target: path,
          tone,
        };

      case AgentFs.TOOL_NAMES.write_file:
        return {
          action: "write",
          title: isActive(entry) ? "Writing file" : "Wrote file",
          detail: shortPath(path),
          target: path,
          tone,
        };

      case AgentFs.TOOL_NAMES.list_files:
        return {
          action: "list",
          title: isActive(entry) ? "Listing files" : "Listed files",
          detail: describeListDetail(entry),
          tone,
        };

      case AgentFs.TOOL_NAMES.grep_files:
        return {
          action: "search",
          title: isActive(entry) ? "Searching files" : "Searched files",
          detail: stringValue(args.pattern),
          tone,
        };

      case AgentTodos.TOOL_NAMES.todo_write:
        return {
          action: "plan",
          title: isActive(entry) ? "Updating plan" : "Updated plan",
          detail: describeTodosDetail(entry),
          tone,
        };

      case "run_command":
        return {
          action: "command",
          title: isActive(entry) ? "Running command" : "Ran command",
          detail: describeCommandDetail(entry),
          tone,
        };

      case "question":
        return {
          action: "question",
          title: isActive(entry) ? "Asking you" : "Asked you",
          detail: describeQuestionDetail(entry),
          tone,
        };

      default:
        return {
          action: "tool",
          title: isActive(entry) ? "Using tool" : "Used tool",
          detail: toolName,
          tone,
        };
    }
  }

  export function summarize(entries: ReadonlyArray<ToolCallEntry>): string {
    if (entries.length === 0) return "No tool calls";

    const counts = new Map<ToolDisplayAction, number>();
    const files = new Map<ToolDisplayAction, Set<string>>();
    for (const entry of entries) {
      const desc = describe(entry);
      if (isFileAction(desc.action) && desc.target) {
        const targets = files.get(desc.action) ?? new Set<string>();
        targets.add(desc.target);
        files.set(desc.action, targets);
        continue;
      }
      counts.set(desc.action, (counts.get(desc.action) ?? 0) + 1);
    }
    for (const [action, targets] of files) {
      counts.set(action, (counts.get(action) ?? 0) + targets.size);
    }

    const clauses: string[] = [];
    pushClause(clauses, counts, "edit", "edited");
    pushClause(clauses, counts, "write", "wrote");
    pushClause(clauses, counts, "read", "read");
    pushClause(clauses, counts, "search", "searched");
    pushClause(clauses, counts, "list", "listed");
    pushClause(clauses, counts, "command", "ran");
    pushClause(clauses, counts, "plan", "updated", "plan update");
    pushClause(clauses, counts, "tool", "used");

    return capitalize(clauses.join(", "));
  }
}

function isFileAction(action: ToolDisplayAction): boolean {
  return action === "read" || action === "edit" || action === "write";
}

function pushClause(
  clauses: string[],
  counts: Map<ToolDisplayAction, number>,
  action: ToolDisplayAction,
  verb: string,
  nounOverride?: string
) {
  const count = counts.get(action);
  if (!count) return;
  const noun = nounOverride ?? nounForAction(action);
  clauses.push(`${verb} ${count} ${pluralize(noun, count)}`);
}

function nounForAction(action: ToolDisplayAction): string {
  switch (action) {
    case "read":
    case "edit":
    case "write":
      return "file";
    case "search":
      return "search";
    case "list":
      return "listing";
    case "command":
      return "command";
    case "plan":
      return "plan update";
    case "question":
      return "question";
    case "tool":
      return "tool call";
  }
}

function pluralize(noun: string, count: number): string {
  if (count === 1) return noun;
  if (noun === "search") return "searches";
  return `${noun}s`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function describeTone(entry: ToolCallEntry): ToolDisplayTone {
  if (isActive(entry)) return "running";
  if (entry.state === "output-error" || entry.state === "output-denied") {
    return "error";
  }
  const output = readToolOutput(entry);
  if (
    output &&
    typeof output === "object" &&
    (output as { ok?: boolean }).ok === false
  ) {
    return "warn";
  }
  return "ok";
}

function describeEditDetail(
  entry: ToolCallEntry,
  path?: string
): string | undefined {
  const result = asRecord(readToolOutput(entry));
  const occurrences = numberValue(result.occurrences);
  const base = shortPath(path);
  if (!base) return occurrences ? `${occurrences} occurrences` : undefined;
  if (!occurrences || occurrences <= 1) return base;
  return `${base}, ${occurrences} occurrences`;
}

function describeListDetail(entry: ToolCallEntry): string | undefined {
  const files = asArray(asRecord(readToolOutput(entry)).files);
  if (!files) return undefined;
  return `${files.length} ${pluralize("file", files.length)}`;
}

function describeTodosDetail(entry: ToolCallEntry): string | undefined {
  const argsTodos = asArray(asRecord(readToolInput(entry)).todos);
  const result = asRecord(readToolOutput(entry));
  const resultTodos = asArray(result.todos);
  const count =
    numberValue(result.count) ?? resultTodos?.length ?? argsTodos?.length;
  if (count === undefined) return undefined;
  return `${count} ${pluralize("item", count)}`;
}

function describeQuestionDetail(entry: ToolCallEntry): string | undefined {
  const questions = asArray(asRecord(readToolInput(entry)).questions);
  if (!questions || questions.length === 0) return undefined;
  if (questions.length === 1) {
    return stringValue(asRecord(questions[0]).question);
  }
  return `${questions.length} questions`;
}

function describeCommandDetail(entry: ToolCallEntry): string | undefined {
  const args = asRecord(readToolInput(entry));
  const description = stringValue(args.description);
  if (description) return description;
  const command = stringValue(args.command);
  const argv = asArray(args.args)
    ?.filter((item): item is string => typeof item === "string")
    .join(" ");
  if (!command) return undefined;
  return argv ? `${command} ${argv}` : command;
}

function isActive(entry: ToolCallEntry): boolean {
  return (
    entry.state === "input-streaming" ||
    entry.state === "input-available" ||
    entry.state === "approval-requested" ||
    entry.state === "approval-responded"
  );
}

function readToolInput(entry: ToolCallEntry): unknown {
  return "input" in entry ? entry.input : undefined;
}

function readToolOutput(entry: ToolCallEntry): unknown {
  return "output" in entry ? entry.output : undefined;
}

function shortPath(path?: string): string | undefined {
  if (!path) return undefined;
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
