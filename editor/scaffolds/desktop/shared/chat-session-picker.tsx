/**
 * Shared header strip used by the desktop chat panels — chat-list button,
 * inline-editable current title, "New chat", and a per-chat actions menu
 * (rename, copy session id, delete). The same `SessionActionsMenu` ("…") is
 * used both on the current chat in the header and on every row of the session
 * list, so the action set stays identical. Rename always switches to that chat
 * and activates the one inline title editor.
 * (see test/desktop-chat-session-header.md)
 *
 * Both `ai-sidebar/chat.tsx` and `workbench/agent-pane.tsx` consume
 * this. The picker reads its data from a `useChatSession()` result; the
 * panel's `onSelect` callback is responsible for re-creating the
 * `@ai-sdk/react` Chat instance against the newly-picked session.
 */

"use client";

import { useRef, useState } from "react";
import {
  CopyIcon,
  EllipsisVerticalIcon,
  ListIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { cn } from "@app/ui/lib/utils";
import type { UseChatSessionResult } from "@/lib/agent-chat";

/** A single recent-session row, as surfaced by `useChatSession()`. */
type SessionRow = UseChatSessionResult["sessions"][number];

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("[chat-session-picker] failed to copy to clipboard", err);
  }
}

export type ChatSessionPickerProps = {
  /** Result of `useChatSession({ ... })`. */
  session: UseChatSessionResult;
  /** Optional left-edge icon (e.g. SparklesIcon for the standalone-doc sidebar). */
  icon?: React.ReactNode;
  /** Label shown when no session is active (e.g. "Agent"). */
  defaultTitle: string;
  /**
   * Called when the user picks a different session. The panel uses
   * this to update `useChatSession` state and re-create the underlying
   * Chat instance.
   */
  onSelect: (sessionId: string | null) => void;
  /**
   * Whether the active conversation has no messages yet. Combined with a
   * null `session.currentId` (no session created server-side), this marks
   * a pristine "new chat" — the panel is already showing exactly what the
   * "New chat" button would create, so the picker hides that button.
   * Defaults to false (button always shown) for callers that don't track
   * message state.
   */
  conversationEmpty?: boolean;
  className?: string;
};

export function ChatSessionPicker({
  session,
  icon,
  defaultTitle,
  onSelect,
  conversationEmpty = false,
  className,
}: ChatSessionPickerProps) {
  const [draft, setDraft] = useState("");
  // The session being renamed in the header title, or null when not editing.
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  // Prevent Enter/Escape from being reinterpreted by the input's subsequent
  // blur as a second commit. Reset for every new inline-edit session.
  const renameExitRef = useRef<"commit" | "cancel" | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const current = session.sessions.find((s) => s.id === session.current_id);
  const currentTitle = current?.title ?? defaultTitle;
  const deleteTarget = session.sessions.find((s) => s.id === deleteTargetId);

  // "New chat" is redundant when we're already on a brand-new, unused
  // chat: no session id yet (currentId === null) AND nothing sent
  // (conversationEmpty). Hide it until the chat is actually used — the
  // moment a message is sent `conversationEmpty` flips false and the
  // button returns, even before the new session id resolves server-side.
  const hideNewChat = session.current_id === null && conversationEmpty;

  const openRename = (s: SessionRow) => {
    setListOpen(false);
    if (s.id !== session.current_id) onSelect(s.id);
    renameExitRef.current = null;
    setDraft(s.title);
    setRenameTargetId(s.id);
  };
  const commitRename = async () => {
    if (renameExitRef.current !== null) return;
    renameExitRef.current = "commit";
    const id = renameTargetId;
    const next = draft.trim();
    setRenameTargetId(null);
    if (!id) return;
    const target = session.sessions.find((s) => s.id === id);
    if (!target || next.length === 0 || next === target.title) return;
    try {
      await session.rename(id, next);
    } catch {
      // swallow; the rename API surfaces its own errors via UI flow elsewhere
    }
  };

  return (
    <>
      <header
        className={cn(
          "flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs font-medium",
          className
        )}
      >
        {icon}
        <DropdownMenu open={listOpen} onOpenChange={setListOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Open chat list"
              title="Open chat list"
              className="shrink-0"
            >
              <ListIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onSelect={() => onSelect(null)}>
              <MessageSquarePlusIcon className="size-3.5" />
              New chat
            </DropdownMenuItem>
            {session.sessions.length > 0 && <DropdownMenuSeparator />}
            {session.sessions.slice(0, 20).map((s) => (
              <DropdownMenuItem
                key={s.id}
                onSelect={() => onSelect(s.id)}
                className={cn(
                  "flex items-center gap-2",
                  s.id === session.current_id && "bg-accent"
                )}
              >
                <span className="flex-1 truncate">{s.title}</span>
                <SessionActionsMenu
                  session={s}
                  onRename={openRename}
                  onDelete={setDeleteTargetId}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {renameTargetId !== null ? (
          <Input
            value={draft}
            autoFocus
            aria-label="Chat title"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (renameExitRef.current === null) void commitRename();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                void commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                renameExitRef.current = "cancel";
                setRenameTargetId(null);
              }
            }}
            className="h-7 min-w-0 flex-1 px-1.5 text-xs font-medium"
          />
        ) : (
          <span
            className={cn(
              "min-w-0 truncate text-muted-foreground",
              current && "cursor-text"
            )}
            title={current ? "Double-click to rename" : currentTitle}
            onDoubleClick={() => {
              if (current) openRename(current);
            }}
          >
            {currentTitle}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!hideNewChat && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onSelect(null)}
              aria-label="New chat"
              title="New chat"
            >
              <PlusIcon className="size-3.5" />
            </Button>
          )}
          {current && (
            <SessionActionsMenu
              session={current}
              onRename={openRename}
              onDelete={setDeleteTargetId}
            />
          )}
        </div>
      </header>

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              {deleteTarget ? `"${deleteTarget.title}"` : "this chat"} and its
              messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const id = deleteTargetId;
                setDeleteTargetId(null);
                if (id) void session.remove(id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The "…" actions menu for a single chat — Rename, Copy session ID,
 * Delete. Used both on the current chat in the header and on each row of
 * the session list, so the two stay in lock-step.
 */
function SessionActionsMenu({
  session: s,
  onRename,
  onDelete,
}: {
  session: SessionRow;
  onRename: (s: SessionRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Chat actions"
          title="Chat actions"
          className="shrink-0"
          // This trigger sits inside a selectable row (DropdownMenuItem).
          // Radix's menu item synthesizes a click on the row at pointer-up
          // when it never saw the matching pointer-down (`!isPointerDownRef`,
          // see @radix-ui/react-menu MenuItem). Stopping only pointer-down +
          // click leaves that pointer-up path open, so opening this menu also
          // selects the row — switching sessions and closing the list out from
          // under the just-opened menu. Stop all three.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <EllipsisVerticalIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onRename(s)}>
          <PencilIcon className="size-3.5" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyToClipboard(s.id)}>
          <CopyIcon className="size-3.5" />
          Copy session ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(s.id)}>
          <Trash2Icon className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
