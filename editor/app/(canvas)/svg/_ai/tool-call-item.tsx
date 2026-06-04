"use client";

import { useState } from "react";
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  FilePlus2Icon,
  Loader2Icon,
  ReplaceIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/components/lib/utils/index";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { AgentFs } from "@grida/agent/fs";

type Tone = "ok" | "warn" | "error";

// Either tool's failure shape — the UI treats both uniformly.
type EditOrWriteFailure = AgentFs.EditFailure | AgentFs.WriteFailure;

/**
 * Compact, polished tool-call row for the SVG agent.
 *
 * Design: a single line — verb, status icon, with the disclosure handle
 * muted and only fading in on hover. Details (raw input/output JSON) are
 * intentionally tucked away; users don't need them, debuggers can still
 * click through.
 */
export function ToolCallItem({
  part,
}: {
  part: ToolUIPart | DynamicToolUIPart;
}) {
  const [open, setOpen] = useState(false);
  const toolName = getToolName(part);
  const { icon, label, tone } = describe(toolName, part.state, part.output);

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";

  const statusIcon = isRunning ? (
    <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
  ) : tone === "error" ? (
    <XIcon className="size-3.5 text-destructive" />
  ) : tone === "warn" ? (
    <TriangleAlertIcon className="size-3.5 text-amber-600" />
  ) : (
    <CheckIcon className="size-3.5 text-emerald-600" />
  );

  return (
    <div className="group w-full text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
          "hover:bg-muted/50",
          tone === "error" && "text-destructive",
          tone === "warn" && "text-amber-700 dark:text-amber-500"
        )}
        aria-expanded={open}
      >
        <span className="text-muted-foreground/80">{icon}</span>
        <span className="flex-1 truncate font-medium">{label}</span>
        {statusIcon}
        <ChevronDownIcon
          className={cn(
            "size-3 text-muted-foreground/40 transition",
            "opacity-0 group-hover:opacity-100",
            open && "rotate-180 opacity-100"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-1 space-y-2 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-2">
          {part.input !== undefined && (
            <DetailBlock label="Input" value={part.input} />
          )}
          {part.output !== undefined && (
            <DetailBlock label="Output" value={part.output} />
          )}
          {part.errorText && (
            <DetailBlock label="Error" value={part.errorText} error />
          )}
        </div>
      )}
    </div>
  );
}

function describe(
  toolName: string,
  state: ToolUIPart["state"],
  output: unknown
): { icon: React.ReactNode; label: string; tone: Tone } {
  const isRunning = state === "input-streaming" || state === "input-available";
  const isError = state === "output-error";

  // `edit_file` / `write_file` may resolve `output-available` but with
  // `{ ok: false }` — model self-recovers, but we surface the rejection
  // as a soft warning so the user can tell what happened.
  const rejection: EditOrWriteFailure | null =
    state === "output-available" &&
    (toolName === AgentFs.TOOL_NAMES.edit_file ||
      toolName === AgentFs.TOOL_NAMES.write_file) &&
    output &&
    typeof output === "object" &&
    (output as { ok?: boolean }).ok === false
      ? (output as EditOrWriteFailure)
      : null;

  const success: AgentFs.EditSuccess | null =
    state === "output-available" &&
    output &&
    typeof output === "object" &&
    (output as { ok?: boolean }).ok === true
      ? (output as AgentFs.EditSuccess)
      : null;

  if (toolName === AgentFs.TOOL_NAMES.read_file) {
    return {
      icon: <EyeIcon className="size-3.5" />,
      label: isRunning ? "Reading canvas" : "Read canvas",
      tone: isError ? "error" : "ok",
    };
  }

  if (toolName === AgentFs.TOOL_NAMES.edit_file) {
    if (rejection)
      return {
        icon: <ReplaceIcon className="size-3.5" />,
        ...rejectionLabel(rejection),
      };
    const count = success?.occurrences;
    return {
      icon: <ReplaceIcon className="size-3.5" />,
      label: isRunning
        ? "Editing canvas"
        : count && count > 1
          ? `Edited canvas (${count} occurrences)`
          : "Edited canvas",
      tone: isError ? "error" : "ok",
    };
  }

  if (toolName === AgentFs.TOOL_NAMES.write_file) {
    if (rejection)
      return {
        icon: <FilePlus2Icon className="size-3.5" />,
        ...rejectionLabel(rejection),
      };
    return {
      icon: <FilePlus2Icon className="size-3.5" />,
      label: isRunning ? "Writing canvas" : "Wrote canvas",
      tone: isError ? "error" : "ok",
    };
  }

  // Generic fallback for any tool we haven't tailored.
  return {
    icon: <WrenchIcon className="size-3.5" />,
    label: isRunning ? `${toolName}…` : toolName,
    tone: isError ? "error" : "ok",
  };
}

function rejectionLabel(rej: EditOrWriteFailure): {
  label: string;
  tone: Tone;
} {
  switch (rej.reason) {
    case "stale":
      return { label: "Canvas changed — will retry", tone: "warn" };
    case "parse_error":
      return { label: "Invalid SVG — will retry", tone: "warn" };
    case "not_read":
      return { label: "Read first — will retry", tone: "warn" };
    case "not_found":
      return { label: "Snippet not found — will retry", tone: "warn" };
    case "ambiguous":
      return {
        label: rej.occurrences
          ? `Ambiguous (${rej.occurrences} matches) — will retry`
          : "Ambiguous match — will retry",
        tone: "warn",
      };
    case "no_op":
      return { label: "No change", tone: "warn" };
    default:
      return { label: "Edit rejected", tone: "warn" };
  }
}

function DetailBlock({
  label,
  value,
  error,
}: {
  label: string;
  value: unknown;
  error?: boolean;
}) {
  const code =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "overflow-hidden rounded text-[11px]",
          error && "text-destructive"
        )}
      >
        <CodeBlock code={code} language="json" />
      </div>
    </div>
  );
}
