import { AgentFs } from "@grida/agent/fs";
import { AgentTodos } from "@grida/agent/todos";
import { AgentVision } from "@grida/agent/vision";
import { AgentDesignSearch } from "@grida/agent/tools/design-search";
import { getToolName } from "ai";
import type { ToolCallEntry } from "@/lib/agent-chat";

const GENERATE_IMAGE = "generate_image";
const SKILL = "skill";

export type ToolDisplayAction =
  | "read"
  | "edit"
  | "write"
  | "list"
  | "search"
  | "view_image"
  | "generate_image"
  | "plan"
  | "command"
  | "question"
  | "skill"
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
          title: describeTitle(
            tone,
            "Reading file",
            "Read file",
            "Failed to read file"
          ),
          detail: shortPath(path),
          target: path,
          tone,
        };

      case AgentFs.TOOL_NAMES.edit_file:
        return {
          action: "edit",
          title: describeTitle(
            tone,
            "Editing file",
            "Edited file",
            "Failed to edit file"
          ),
          detail: describeEditDetail(entry, path),
          target: path,
          tone,
        };

      case AgentFs.TOOL_NAMES.write_file:
        return {
          action: "write",
          title: describeTitle(
            tone,
            "Writing file",
            "Wrote file",
            "Failed to write file"
          ),
          detail: shortPath(path),
          target: path,
          tone,
        };

      case AgentFs.TOOL_NAMES.list_files:
        return {
          action: "list",
          title: describeTitle(
            tone,
            "Listing files",
            "Listed files",
            "Failed to list files"
          ),
          detail: describeListDetail(entry),
          tone,
        };

      case AgentFs.TOOL_NAMES.grep_files:
        return {
          action: "search",
          title: describeTitle(
            tone,
            "Searching files",
            "Searched files",
            "Failed to search files"
          ),
          detail: stringValue(args.pattern),
          tone,
        };

      case AgentTodos.TOOL_NAMES.todo_write:
        return {
          action: "plan",
          title: describeTitle(
            tone,
            "Updating plan",
            "Updated plan",
            "Failed to update plan"
          ),
          detail: describeTodosDetail(entry),
          tone,
        };

      case AgentVision.TOOL_NAMES.view_image:
        return {
          action: "view_image",
          title: describeTitle(
            tone,
            "Viewing image",
            "Viewed image",
            "Failed to view image"
          ),
          detail: shortPath(path),
          target: path,
          tone,
        };

      case GENERATE_IMAGE:
        return {
          action: "generate_image",
          title: describeTitle(
            tone,
            "Generating image",
            "Generated image",
            "Failed to generate image"
          ),
          detail: describeGenerateImageDetail(entry),
          tone,
        };

      case "run_command":
        return {
          action: "command",
          title: describeTitle(
            tone,
            "Running command",
            "Ran command",
            "Command failed"
          ),
          detail: describeCommandDetail(entry),
          tone,
        };

      case "question":
        return {
          action: "question",
          title: describeTitle(
            tone,
            "Asking you",
            "Asked you",
            "Failed to ask you"
          ),
          detail: describeQuestionDetail(entry),
          tone,
        };

      case SKILL:
        return {
          action: "skill",
          title: describeTitle(
            tone,
            "Loading skill",
            "Loaded skill",
            "Failed to load skill"
          ),
          detail: stringValue(args.name),
          tone,
        };

      case AgentDesignSearch.TOOL_NAME:
        return {
          action: "search",
          title: describeTitle(
            tone,
            "Searching library",
            "Searched library",
            "Failed to search library"
          ),
          detail: stringValue(args.query),
          tone,
        };

      default:
        return {
          action: "tool",
          title: describeTitle(tone, "Using tool", "Used tool", "Tool failed"),
          detail: toolName,
          tone,
        };
    }
  }

  export function summarize(entries: ReadonlyArray<ToolCallEntry>): string {
    if (entries.length === 0) return "No tool calls";

    const counts = new Map<ToolDisplayAction, number>();
    const files = new Map<ToolDisplayAction, Set<string>>();
    let running = 0;
    let failed = 0;
    for (const entry of entries) {
      const desc = describe(entry);
      if (desc.tone === "running") {
        running += 1;
        continue;
      }
      if (desc.tone === "warn" || desc.tone === "error") {
        failed += 1;
        continue;
      }
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
    pushClause(clauses, counts, "generate_image", "generated", "image");
    pushClause(clauses, counts, "view_image", "viewed", "image");
    pushClause(clauses, counts, "search", "searched");
    pushClause(clauses, counts, "list", "listed");
    pushClause(clauses, counts, "command", "ran");
    pushClause(clauses, counts, "plan", "updated", "plan update");
    pushClause(clauses, counts, "question", "asked");
    pushClause(clauses, counts, "skill", "loaded", "skill");
    pushClause(clauses, counts, "tool", "used");
    pushStatusClause(clauses, running, "running");
    pushStatusClause(clauses, failed, "failed");

    return capitalize(clauses.join(", "));
  }
}

function describeTitle(
  tone: ToolDisplayTone,
  running: string,
  succeeded: string,
  failed: string
): string {
  if (tone === "running") return running;
  return tone === "ok" ? succeeded : failed;
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

function pushStatusClause(
  clauses: string[],
  count: number,
  status: "running" | "failed"
) {
  if (count === 0) return;
  clauses.push(`${count} ${pluralize("tool", count)} ${status}`);
}

function nounForAction(action: ToolDisplayAction): string {
  switch (action) {
    case "read":
    case "edit":
    case "write":
      return "file";
    case "search":
      return "search";
    case "view_image":
    case "generate_image":
      return "image";
    case "list":
      return "listing";
    case "command":
      return "command";
    case "plan":
      return "plan update";
    case "question":
      return "question";
    case "skill":
      return "skill";
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

function describeGenerateImageDetail(entry: ToolCallEntry): string | undefined {
  const args = asRecord(readToolInput(entry));
  const prompt = stringValue(args.prompt);
  if (prompt) return prompt;
  return shortPath(stringValue(asRecord(readToolOutput(entry)).path));
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
