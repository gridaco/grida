"use client";

import type { NativeChatPermissionReview } from "@grida/desktop-bridge";
import {
  FolderIcon,
  GlobeIcon,
  ShieldAlertIcon,
  TerminalIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@app/ui/components/alert-dialog";

/** Review one host-bound Full access choice for the currently attached chat. */
export function AgentPermissionConfirmation({
  review,
  onAnswer,
}: {
  review: NativeChatPermissionReview | null;
  onAnswer(confirmed: boolean): void;
}) {
  if (!review) return null;
  return (
    <AlertDialog
      open={review !== null}
      onOpenChange={(open) => {
        if (!open) onAnswer(false);
      }}
    >
      <AlertDialogContent
        data-testid="agent-permission-confirmation"
        className="gap-3 p-5 data-[size=default]:sm:max-w-sm"
      >
        <AlertDialogHeader className="flex min-w-0 flex-row items-center gap-3 text-left">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <ShieldAlertIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <AlertDialogTitle className="text-lg">
              Enable Full access?
            </AlertDialogTitle>
            <AlertDialogDescription
              className="truncate text-xs"
              title={`For this chat in ${review.workspaceName}.`}
            >
              For this chat in {review.workspaceName}.
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <ul className="grid gap-2.5 rounded-lg bg-muted/50 p-3 text-[13px]">
          <li className="flex items-center gap-2.5">
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            Files across your computer
          </li>
          <li className="flex items-center gap-2.5">
            <TerminalIcon className="size-4 shrink-0 text-muted-foreground" />
            Commands and package installs
          </li>
          <li className="flex items-center gap-2.5">
            <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
            Internet and local services
          </li>
        </ul>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-amber-600">
            No sandbox or approval prompts.
          </span>{" "}
          Includes credentials your account can read.
        </p>
        <p className="text-xs text-muted-foreground">
          This chat only. New chats use Default.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" onClick={() => onAnswer(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction size="sm" onClick={() => onAnswer(true)}>
            Enable Full access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
