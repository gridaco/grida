/**
 * Shared save-state chrome for editable workspace panes (issue #805).
 *
 * The dirty badge, save-error toast, and save-conflict resolver are
 * editor-agnostic — the SVG editor and the CodeMirror text/markdown editor
 * present identical affordances. Kept here so neither pane carries a private
 * copy and the three editor-agnostic conflict choices stay consistent.
 */
"use client";

import { AlertCircleIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
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

/**
 * Save-time conflict resolver. Shown when a Cmd+S is rejected because the file
 * changed on disk since we loaded it. Offers the three editor-agnostic choices
 * VSCode falls back to when it can't show a meaningful diff surface: keep
 * editing, discard-and-reload, or overwrite.
 */
export function SaveConflictDialog({
  relPath,
  open,
  onKeepEditing,
  onReload,
  onOverwrite,
}: {
  relPath: string;
  open: boolean;
  onKeepEditing: () => void;
  onReload: () => void;
  onOverwrite: () => void;
}) {
  const name = relPath.split("/").pop() || relPath;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeepEditing();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>File changed on disk</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{name}&rdquo; was modified outside the editor since you
            opened it. Saving now would overwrite that change. Reload to take
            the version on disk (discarding your edits), or overwrite it with
            yours.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeepEditing}>
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction onClick={onReload}>
            Reload from disk
          </AlertDialogAction>
          <AlertDialogAction variant="destructive" onClick={onOverwrite}>
            Overwrite anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DirtyBadge({
  dirty,
  saving,
  className,
}: {
  dirty: boolean;
  saving: boolean;
  /** Override the default top-right anchor (e.g. when another control sits there). */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-full border bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          saving ? "bg-sky-500" : "bg-amber-500"
        )}
        aria-hidden
      />
      {saving ? "Saving…" : dirty ? "Unsaved" : null}
    </div>
  );
}

export function SaveErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute inset-x-3 bottom-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm">
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-destructive/70 underline hover:text-destructive"
      >
        dismiss
      </button>
    </div>
  );
}
