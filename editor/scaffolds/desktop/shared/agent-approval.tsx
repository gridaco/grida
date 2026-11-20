"use client";

import type {
  NativeChatApproval,
  NativeChatApprovalDecision,
} from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { ShieldAlertIcon } from "lucide-react";

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
  const description =
    approval.tool === "exec_command"
      ? approval.network
        ? "Allow this command to connect to the requested destination?"
        : "Allow this command to run in the sandbox?"
      : approval.tool === "write_file" || approval.tool === "edit_file"
        ? "The agent is asking to change its settings file."
        : "The agent is asking for additional read access.";
  return (
    <div
      role="group"
      aria-label="Permission approval"
      className="grid shrink-0 gap-2 bg-muted/30 px-3 py-2.5 text-sm leading-5"
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
                {approval.network ? (
                  <>
                    Destination {reviewText(approval.network.host)} port{" "}
                    {approval.network.port}
                  </>
                ) : (
                  "Network access denied"
                )}
              </div>
              <div>Command {reviewText(approval.command)}</div>
              <div>
                Shell{" "}
                {reviewText(
                  approval.scope?.resolvedExecutable ?? approval.executable
                )}
              </div>
              <div>
                Working folder{" "}
                {reviewText(approval.scope?.resolvedCwd ?? approval.cwd)}
              </div>
              {approval.scope ? (
                <>
                  <div>
                    {approval.scope.diskRead
                      ? "Can read files outside the project, except protected locations."
                      : "File reads are limited to the listed folders and runtime paths."}
                  </div>
                  {approval.scope.readRoots.length > 0 && (
                    <div>
                      Read folders{" "}
                      {approval.scope.readRoots.map(reviewText).join(", ")}
                    </div>
                  )}
                  <div>
                    {approval.scope.writeRoots.length
                      ? "Writable folders " +
                        approval.scope.writeRoots.map(reviewText).join(", ")
                      : "No writable project folders"}
                  </div>
                  {approval.scope.privateTempWrite && (
                    <div>Can write private temporary files.</div>
                  )}
                  {(approval.scope.runtimeRoots.length > 0 ||
                    approval.scope.environmentNames.length > 0) && (
                    <details>
                      <summary>Runtime paths and environment</summary>
                      {approval.scope.runtimeRoots.length > 0 && (
                        <div>
                          Runtime paths{" "}
                          {approval.scope.runtimeRoots
                            .map(reviewText)
                            .join(", ")}
                        </div>
                      )}
                      {approval.scope.environmentNames.length > 0 && (
                        <div>
                          Environment variables{" "}
                          {approval.scope.environmentNames
                            .map(reviewText)
                            .join(", ")}
                        </div>
                      )}
                    </details>
                  )}
                </>
              ) : (
                <p>
                  The host could not verify this command’s filesystem scope.
                  Decline this request to continue.
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
          disabled={
            disabled || (approval.tool === "exec_command" && !approval.scope)
          }
          onClick={() => void onDecision("approve_once")}
        >
          Allow once
        </Button>
      </div>
    </div>
  );
}

/** Quote untrusted approval details, including invisible direction controls. */
export function reviewText(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}
