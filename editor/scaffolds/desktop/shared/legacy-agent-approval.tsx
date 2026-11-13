"use client";

/**
 * The earlier chat's supervised-command approval: reads AI SDK
 * `approval-requested` tool parts from the retired TypeScript agent stream.
 * Only the earlier workspace pane and file-window chat render it, which only
 * installed Desktop builds without native chat reach. Remove it with those
 * panes. Native approvals use `AgentApprovalPrompt` directly.
 */

import type { UIMessage } from "ai";
import { AgentApprovalPrompt } from "./agent-approval";

/**
 * A supervised command awaiting the user's Allow/Deny (see
 * permissions.md#approval-modes). Both ids ride the answer back so the sidecar can match it
 * to the persisted pending approval.
 */
export type PendingApproval = {
  approvalId: string;
  toolCallId: string;
  /** Human label for the command, e.g. `python3 quadtree.py`. */
  label: string;
  description?: string;
};

/**
 * Find a pending supervised approval on the last assistant turn.
 *
 * Tolerant of both live camelCase and hydrated snake_case tool-call ids; the
 * remaining fields have the same shape on both paths.
 */
export function findPendingApproval(
  messages: UIMessage[]
): PendingApproval | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  for (const part of last.parts) {
    const pending = part as {
      type?: string;
      state?: string;
      toolCallId?: string;
      tool_call_id?: string;
      approval?: { id?: string };
      input?: { command?: string; args?: string[]; description?: string };
    };
    const toolCallId = pending.toolCallId ?? pending.tool_call_id;
    if (
      typeof pending.type !== "string" ||
      (!pending.type.startsWith("tool-") && pending.type !== "dynamic-tool") ||
      pending.state !== "approval-requested" ||
      !pending.approval?.id ||
      !toolCallId
    ) {
      continue;
    }
    const input = pending.input ?? {};
    const label = input.command
      ? `${input.command} ${(input.args ?? []).join(" ")}`.trim()
      : pending.type.replace(/^tool-/, "");
    return {
      approvalId: pending.approval.id,
      toolCallId,
      label,
      description: input.description,
    };
  }
  return null;
}

/**
 * Session-global supervised-approval prompt, rendered above the composer so
 * Allow/Deny is immediately visible rather than buried in a tool row.
 */
export function AgentApprovalBar({
  pending,
  onApprove,
}: {
  pending: PendingApproval;
  onApprove: (
    pending: PendingApproval,
    approved: boolean
  ) => void | Promise<void>;
}) {
  return (
    <AgentApprovalPrompt
      description={`${pending.description || "This command mutates files or executes code."} Allow it to run?`}
      detail={
        <code className="mt-1 block truncate font-mono text-xs text-foreground/80">
          $ {pending.label}
        </code>
      }
      acceptLabel="Allow"
      declineLabel="Deny"
      onDecision={(approved) => onApprove(pending, approved)}
    />
  );
}
