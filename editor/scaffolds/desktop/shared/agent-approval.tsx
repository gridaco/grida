"use client";

import type {
  NativeChatApproval,
  NativeChatApprovalDecision,
} from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { ShieldAlertIcon } from "lucide-react";
import { AgentPromptCard } from "@/kits/agent-chat/prompt-card";

const APPROVAL_ACTION = {
  read_file: "Read file",
  list_files: "List folder",
  search_text: "Search files",
  write_file: "Replace file",
  edit_file: "Edit file",
} as const;
const REVIEW_FAILURE = {
  timed_out: "Automatic review timed out.",
  interrupted: "Automatic review was interrupted.",
  unavailable: "Automatic review was unavailable.",
  invalid_reply: "The reviewer could not give a valid decision.",
  needs_human: "The reviewer needs your decision.",
} as const;

export function AgentApprovalPrompt({
  approval,
  disabled,
  onDecision,
}: {
  approval: NativeChatApproval;
  disabled?: boolean;
  onDecision: (decision: NativeChatApprovalDecision) => void | Promise<void>;
}) {
  const command = approval.tool === "exec_command" ? approval : undefined;
  const escalated =
    command?.sandboxPermissions === "require_escalated" ? command : undefined;
  const confined =
    command?.sandboxPermissions !== "require_escalated" ? command : undefined;
  const scope = command?.scope;
  const verified =
    scope && (!escalated || (escalated.access && escalated.network));
  const description = escalated
    ? "Allow this command to run with additional access?"
    : confined
      ? confined.network
        ? "Allow this command to connect to the requested destination?"
        : "Allow this command to run in the sandbox?"
      : approval.tool === "write_file" || approval.tool === "edit_file"
        ? "The agent is asking to change its settings file."
        : "The agent is asking for additional read access.";
  return (
    <AgentPromptCard
      role="group"
      aria-label="Permission approval"
      className="shrink-0"
    >
      <div className="flex min-h-6 items-center gap-2 px-2 text-muted-foreground">
        <ShieldAlertIcon aria-hidden="true" className="size-4" />
        Permission approval
      </div>
      <div className="min-w-0 px-2">
        <p>{description}</p>
        <div className="mt-1 max-h-24 overflow-y-auto break-all font-mono text-xs text-foreground/80">
          {approval.reviewFailure && (
            <p className="font-sans">
              {REVIEW_FAILURE[approval.reviewFailure]}
            </p>
          )}
          {approval.tool === "exec_command" ? (
            <>
              <div>
                {confined?.network ? (
                  <>
                    Destination {reviewText(confined.network.host)} port{" "}
                    {confined.network.port}
                  </>
                ) : verified && escalated?.network?.kind === "listen" ? (
                  <>
                    Incoming TCP on port {escalated.network.port}. The command
                    chooses the listen address. It can connect to loopback on
                    that port for readiness checks.
                  </>
                ) : verified &&
                  (escalated?.network?.kind === "managed" ||
                    confined?.managedNetwork) ? (
                  "Outbound destinations are approved separately as the command connects."
                ) : verified ? (
                  "Network access denied"
                ) : null}
                {escalated?.access === "read_write" &&
                  verified &&
                  escalated.network?.kind === "denied" && (
                    <p className="font-sans">
                      This command can change version-control metadata in the
                      project.
                    </p>
                  )}
                {confined?.process && verified && (
                  <p className="font-sans">
                    {confined.process === "terminal"
                      ? "The command can accept terminal input and may keep running after this turn."
                      : "The command may keep running after this turn."}
                  </p>
                )}
                {escalated && verified && (
                  <p className="font-sans">
                    Protected locations stay restricted. It may keep running
                    after this turn.
                  </p>
                )}
              </div>
              {escalated && (
                <div>Reason {reviewText(escalated.justification)}</div>
              )}
              <div>Command {reviewText(approval.command)}</div>
              <div>
                Shell{" "}
                {reviewText(scope?.resolvedExecutable ?? approval.executable)}
              </div>
              <div>
                Working folder {reviewText(scope?.resolvedCwd ?? approval.cwd)}
              </div>
              {verified ? (
                <>
                  <div>
                    {scope.diskRead
                      ? "Can read files outside the project, except protected locations."
                      : "File reads are limited to the listed folders and runtime paths."}
                  </div>
                  {scope.readRoots.length > 0 && (
                    <div>
                      Read folders {scope.readRoots.map(reviewText).join(", ")}
                    </div>
                  )}
                  <div>
                    {scope.writeRoots.length
                      ? "Writable folders " +
                        scope.writeRoots.map(reviewText).join(", ")
                      : "No writable project folders"}
                  </div>
                  {scope.privateTempWrite && (
                    <div>Can write private temporary files.</div>
                  )}
                  {(scope.runtimeRoots.length > 0 ||
                    scope.environmentNames.length > 0) && (
                    <details>
                      <summary>Runtime paths and environment</summary>
                      {scope.runtimeRoots.length > 0 && (
                        <div>
                          Runtime paths{" "}
                          {scope.runtimeRoots.map(reviewText).join(", ")}
                        </div>
                      )}
                      {scope.environmentNames.length > 0 && (
                        <div>
                          Environment variables{" "}
                          {scope.environmentNames.map(reviewText).join(", ")}
                        </div>
                      )}
                    </details>
                  )}
                </>
              ) : (
                <p>
                  The host could not verify this command’s permissions. Decline
                  this request to continue.
                </p>
              )}
            </>
          ) : (
            <>
              <div>
                {APPROVAL_ACTION[approval.tool]}{" "}
                {reviewText(
                  approval.root === "/"
                    ? "/" + approval.relativePath
                    : approval.relativePath || "."
                )}
              </div>
              {approval.root !== "/" && (
                <div>Folder {reviewText(approval.root)}</div>
              )}
              {approval.query !== undefined && (
                <div>Search {reviewText(approval.query)}</div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="text-sm font-normal"
          disabled={disabled}
          onClick={() => void onDecision("decline")}
        >
          Decline
        </Button>
        <Button
          type="button"
          size="xs"
          className="text-sm font-normal"
          disabled={disabled || (command !== undefined && !verified)}
          onClick={() => void onDecision("approve_once")}
        >
          Allow once
        </Button>
      </div>
    </AgentPromptCard>
  );
}

/** Quote untrusted approval details, including invisible direction controls. */
export function reviewText(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}
