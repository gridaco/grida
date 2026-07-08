"use client";

import { useState } from "react";
import { getToolName } from "ai";
import { AlertCircleIcon, CheckIcon, CircleIcon } from "lucide-react";
import { AgentFs } from "@grida/agent/fs";
import { AgentTodos } from "@grida/agent/todos";
import { cn } from "@app/ui/lib/utils";
import type { ConfirmationProps } from "@app/ui/ai-elements/confirmation";
import type { ToolCallEntry } from "@/lib/agent-chat";
import { ToolFileContent, ToolFileDiff } from "./tool-diff";

const RUN_COMMAND = "run_command";
const SKILL = "skill";

export function isHumanReadableToolCardEntry(entry: ToolCallEntry): boolean {
  return getToolName(entry) === AgentTodos.TOOL_NAMES.todo_write;
}

export function ToolCardContent({
  entry,
  approval,
}: {
  entry: ToolCallEntry;
  approval?: ConfirmationProps["approval"];
}) {
  return (
    <div className="mt-1 space-y-1">
      <ApprovalEcho entry={entry} approval={approval} />
      <ToolBody entry={entry} />
    </div>
  );
}

function ToolBody({ entry }: { entry: ToolCallEntry }) {
  switch (getToolName(entry)) {
    case AgentFs.TOOL_NAMES.read_file:
      return <ReadFileCard entry={entry} />;
    case AgentFs.TOOL_NAMES.edit_file:
      return <EditFileCard entry={entry} />;
    case AgentFs.TOOL_NAMES.write_file:
      return <WriteFileCard entry={entry} />;
    case AgentFs.TOOL_NAMES.list_files:
      return <ListFilesCard entry={entry} />;
    case AgentFs.TOOL_NAMES.grep_files:
      return <GrepFilesCard entry={entry} />;
    case AgentTodos.TOOL_NAMES.todo_write:
      return <TodoWriteCard entry={entry} />;
    case RUN_COMMAND:
      return <RunCommandCard entry={entry} />;
    case SKILL:
      return <SkillCard entry={entry} />;
    default:
      return <GenericToolCard entry={entry} />;
  }
}

function ApprovalEcho({
  entry,
  approval,
}: {
  entry: ToolCallEntry;
  approval?: ConfirmationProps["approval"];
}) {
  if (
    !approval ||
    (entry.state !== "approval-requested" &&
      entry.state !== "approval-responded" &&
      entry.state !== "output-denied" &&
      entry.state !== "output-available")
  ) {
    return null;
  }

  const denied = approval.approved === false || entry.state === "output-denied";
  const text =
    entry.state === "approval-requested"
      ? "Awaiting approval above the composer."
      : denied
        ? "Denied."
        : "Approved.";

  return (
    <div
      className={cn(
        "truncate text-[11px] text-muted-foreground",
        denied && "text-destructive"
      )}
      title={text}
    >
      {text}
    </div>
  );
}

function ReadFileCard({ entry }: { entry: ToolCallEntry }) {
  const input = asRecord(entry.input);
  const output = asRecord(entry.output);
  const path = str(input.path);
  const content = str(output.content);
  return (
    <ToolDetail
      entry={entry}
      detail={path}
      detailMono
      meta={compact([
        content !== undefined ? `${lineCount(content)} lines` : undefined,
        versionLabel(output),
      ])}
    />
  );
}

function EditFileCard({ entry }: { entry: ToolCallEntry }) {
  const input = asRecord(entry.input);
  const output = asRecord(entry.output);
  const path = str(input.path);
  const oldString = stringValue(input.old_string);
  const newString = stringValue(input.new_string);
  const occurrences = numberValue(output.occurrences);
  return (
    <div className="space-y-1.5">
      <ToolDetail
        entry={entry}
        detail={path}
        detailMono
        meta={compact([
          occurrences !== undefined
            ? `${occurrences} match${occurrences === 1 ? "" : "es"}`
            : undefined,
          versionLabel(output),
        ])}
      />
      {oldString !== undefined && newString !== undefined && (
        <ToolFileDiff
          path={path}
          oldContent={oldString}
          newContent={newString}
        />
      )}
    </div>
  );
}

function WriteFileCard({ entry }: { entry: ToolCallEntry }) {
  const input = asRecord(entry.input);
  const output = asRecord(entry.output);
  const path = str(input.path);
  const content = stringValue(input.content);
  return (
    <div className="space-y-1.5">
      <ToolDetail
        entry={entry}
        detail={path}
        detailMono
        meta={compact([
          content !== undefined ? `${lineCount(content)} lines` : undefined,
          content !== undefined
            ? `${formatCount(content.length)} chars`
            : undefined,
          versionLabel(output),
        ])}
      />
      {content !== undefined && (
        <ToolFileContent path={path} content={content} />
      )}
    </div>
  );
}

function ListFilesCard({ entry }: { entry: ToolCallEntry }) {
  const input = asRecord(entry.input);
  const output = asRecord(entry.output);
  const prefix = str(input.path_prefix) ?? str(input.path);
  const files = stringArray(output.files);
  return (
    <div className="space-y-1">
      {prefix && <ToolDetail entry={entry} detail={prefix} detailMono />}
      {files && files.length > 0 && <FileList files={files} />}
    </div>
  );
}

function GrepFilesCard({ entry }: { entry: ToolCallEntry }) {
  const input = asRecord(entry.input);
  const output = asRecord(entry.output);
  const scope = str(input.path_prefix) ?? str(input.path);
  const matches = grepMatches(output.matches);
  const scanned = numberValue(output.files_scanned);
  return (
    <ToolDetail
      entry={entry}
      detail={scope}
      detailMono={Boolean(scope)}
      meta={compact([
        matches
          ? `${matches.length} match${matches.length === 1 ? "" : "es"}`
          : undefined,
        scanned !== undefined ? `${scanned} scanned` : undefined,
        typeof input.case_sensitive === "boolean"
          ? input.case_sensitive
            ? "case-sensitive"
            : "case-insensitive"
          : undefined,
      ])}
    />
  );
}

function TodoWriteCard({ entry }: { entry: ToolCallEntry }) {
  const input = asRecord(entry.input);
  const output = asRecord(entry.output);
  const todos = todoItems(input.todos);
  const count = numberValue(output.count) ?? todos.length;
  const completed = todos.filter((todo) => todo.status === "completed").length;
  return (
    <div className="space-y-1">
      <ToolDetail
        entry={entry}
        meta={compact([
          todos.length > 0 && completed > 0
            ? `${completed} complete`
            : undefined,
          todos.length === 0
            ? `${count} item${count === 1 ? "" : "s"}`
            : undefined,
        ])}
      />
      {todos.length > 0 && <TodoList todos={todos} />}
    </div>
  );
}

function RunCommandCard({ entry }: { entry: ToolCallEntry }) {
  const input = asRecord(entry.input);
  const output = asRecord(entry.output);
  const command = commandLine(input);
  const exitCode = numberValue(output.exit_code);
  const durationMs = numberValue(output.duration_ms);
  const stdout = str(output.stdout);
  const stderr = str(output.stderr);
  const failed = exitCode !== undefined && exitCode !== 0;
  return (
    <div className="space-y-1.5">
      <ToolDetail
        entry={entry}
        meta={compact([
          exitCode !== undefined ? `exit ${exitCode}` : undefined,
          durationMs !== undefined ? `${durationMs} ms` : undefined,
          bool(output.timed_out) ? "timed out" : undefined,
          bool(output.truncated) ? "truncated" : undefined,
        ])}
      />
      {command && (
        <CommandTranscript
          command={command}
          output={compact([stdout, stderr]).join("\n")}
          failed={failed}
        />
      )}
    </div>
  );
}

function SkillCard({ entry }: { entry: ToolCallEntry }) {
  const output = asRecord(entry.output);
  const content = str(output.content);
  return (
    <ToolDetail
      entry={entry}
      meta={content ? [`${lineCount(content)} lines`] : []}
    />
  );
}

function GenericToolCard({ entry }: { entry: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide details" : "Show details"}
      </button>
      {open && (
        <div className="grid gap-1.5">
          <JsonBlock label="input" value={entry.input} />
          <JsonBlock label="output" value={entry.output} />
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-0.5">
      <div className="font-mono text-[10px] text-muted-foreground">{label}</div>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-sm bg-muted/50 px-2 py-1.5 font-mono text-[11px] leading-4 text-muted-foreground">
        {jsonText(value)}
      </pre>
    </div>
  );
}

function ToolDetail({
  entry,
  detail,
  detailMono,
  meta,
}: {
  entry: ToolCallEntry;
  detail?: string;
  detailMono?: boolean;
  meta?: string[];
}) {
  const notice = resultNotice(entry);
  const tone = statusTone(entry);
  const hasDetail = Boolean(detail);
  const hasMeta = Boolean(meta && meta.length > 0);
  if (
    !hasMeta &&
    !hasDetail &&
    !notice &&
    tone !== "warn" &&
    tone !== "error"
  ) {
    return null;
  }

  return (
    <div>
      {(hasMeta || hasDetail || tone === "warn" || tone === "error") && (
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            {hasMeta && (
              <div className="truncate text-[11px] text-muted-foreground">
                {meta!.join(" · ")}
              </div>
            )}
            {detail && (
              <div
                className={cn(
                  "truncate text-[11px] text-muted-foreground",
                  detailMono && "font-mono"
                )}
                title={detail}
              >
                {detail}
              </div>
            )}
          </div>
          {(tone === "warn" || tone === "error") && (
            <AttentionPill tone={tone} />
          )}
        </div>
      )}
      {notice && (
        <div
          className={cn(
            "mt-0.5 truncate text-[11px]",
            notice.tone === "error" ? "text-destructive" : "text-amber-700"
          )}
          title={notice.text}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}

function AttentionPill({ tone }: { tone: "warn" | "error" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-[10px] leading-none",
        tone === "warn" && "border-amber-600/20 text-amber-700",
        tone === "error" && "text-destructive"
      )}
    >
      <AlertCircleIcon className="size-3" />
      {tone === "warn" ? "warn" : "failed"}
    </span>
  );
}

function FileList({ files }: { files: string[] }) {
  const visible = files.slice(0, 200);
  return (
    <div className="max-h-36 space-y-0.5 overflow-y-auto pr-1">
      {visible.map((file) => (
        <div
          key={file}
          className="truncate font-mono text-[11px] leading-4 text-muted-foreground"
          title={file}
        >
          {file}
        </div>
      ))}
      {files.length > visible.length && (
        <div className="text-[11px] text-muted-foreground">
          +{files.length - visible.length} more
        </div>
      )}
    </div>
  );
}

function CommandTranscript({
  command,
  output,
  failed,
}: {
  command: string;
  output?: string;
  failed: boolean;
}) {
  const value = output ? `$ ${command}\n\n${output}` : `$ ${command}`;
  return (
    <pre
      className={cn(
        "max-h-56 overflow-auto whitespace-pre-wrap rounded-sm bg-muted/50 px-2 py-1.5 font-mono text-[11px] leading-4",
        failed ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {value}
    </pre>
  );
}

function resultNotice(
  entry: ToolCallEntry
): { tone: "warn" | "error"; text: string } | null {
  if (entry.state === "output-denied") {
    return { tone: "error", text: "Denied before execution." };
  }
  if (entry.errorText) {
    return { tone: "error", text: entry.errorText };
  }
  const output = asRecord(entry.output);
  if (getToolName(entry) === RUN_COMMAND) {
    const exitCode = numberValue(output.exit_code);
    if (exitCode !== undefined && exitCode !== 0) {
      return { tone: "error", text: `Command exited with code ${exitCode}.` };
    }
  }
  if (output.ok === false) {
    return {
      tone: "warn",
      text:
        str(output.message) ?? str(output.error) ?? "Tool reported a problem.",
    };
  }
  return null;
}

function statusTone(entry: ToolCallEntry): "running" | "ok" | "warn" | "error" {
  if (entry.state === "input-streaming" || entry.state === "input-available") {
    return "running";
  }
  if (
    entry.state === "approval-requested" ||
    entry.state === "approval-responded"
  ) {
    return "running";
  }
  if (entry.state === "output-error" || entry.state === "output-denied") {
    return "error";
  }
  const output = asRecord(entry.output);
  if (getToolName(entry) === RUN_COMMAND) {
    const exitCode = numberValue(output.exit_code);
    if (exitCode !== undefined && exitCode !== 0) return "error";
  }
  return output.ok === false ? "warn" : "ok";
}

type TodoItem = {
  content: string;
  active_form?: string;
  status: "pending" | "in_progress" | "completed";
};

function TodoList({ todos }: { todos: TodoItem[] }) {
  const visible = todos.slice(0, 6);
  return (
    <div className="space-y-0.5">
      {visible.map((todo, index) => (
        <div
          key={`${todo.content}-${index}`}
          className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4"
        >
          <TodoStatusIcon status={todo.status} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              todo.status === "completed" &&
                "text-muted-foreground line-through",
              todo.status === "pending" && "text-muted-foreground"
            )}
            title={todo.content}
          >
            {todo.content}
          </span>
        </div>
      ))}
      {todos.length > visible.length && (
        <div className="pl-4 text-[11px] text-muted-foreground">
          +{todos.length - visible.length} more
        </div>
      )}
    </div>
  );
}

function TodoStatusIcon({ status }: { status: TodoItem["status"] }) {
  if (status === "completed") {
    return <CheckIcon className="size-3 shrink-0 text-muted-foreground" />;
  }
  if (status === "in_progress") {
    return (
      <CircleIcon className="size-3 shrink-0 fill-amber-500 text-amber-500" />
    );
  }
  return <CircleIcon className="size-3 shrink-0 text-muted-foreground/70" />;
}

function todoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const r = asRecord(item);
    const status = str(r.status);
    return {
      content: str(r.content) ?? str(r.title) ?? `Step ${index + 1}`,
      active_form: str(r.active_form),
      status:
        status === "in_progress" || status === "completed" ? status : "pending",
    };
  });
}

type GrepMatch = { path: string; line?: number; text?: string };

function grepMatches(value: unknown): GrepMatch[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    if (typeof item === "string") {
      const match = item.match(/^(.+?):(\d+)(?::(.*))?$/);
      if (match) {
        return {
          path: match[1],
          line: Number(match[2]),
          text: match[3]?.trim(),
        };
      }
      return { path: item };
    }
    const r = asRecord(item);
    return {
      path: str(r.path) ?? "unknown",
      line: numberValue(r.line),
      text: str(r.text),
    };
  });
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function commandLine(input: Record<string, unknown>): string | undefined {
  const command = str(input.command);
  if (!command) return undefined;
  const args = Array.isArray(input.args)
    ? input.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  return [command, ...args.map(shellQuote)].join(" ");
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(value) ? value : JSON.stringify(value);
}

function versionLabel(output: Record<string, unknown>): string | undefined {
  const version = numberValue(output.version);
  return version !== undefined ? `v${version}` : undefined;
}

function jsonText(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, null, 2);
}

function compact(values: Array<string | undefined | false>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bool(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function lineCount(value: string): number {
  if (value.length === 0) return 0;
  return value.split(/\r\n|\r|\n/).length;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
