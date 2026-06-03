/**
 * Shared header strip used by the desktop chat panels — session picker
 * + "New chat" + a per-chat actions menu (rename, copy session id,
 * delete). The same `SessionActionsMenu` ("…") is used both on the
 * current chat in the header and on every row of the hover session
 * list, so the action set stays identical. Rename happens in a small
 * dialog so it works for any session (current or not) without switching
 * the active chat.
 *
 * Both `ai-sidebar/chat.tsx` and `workbench/agent-pane.tsx` consume
 * this. The picker reads its data from a `useChatSession()` result; the
 * panel's `onSelect` callback is responsible for re-creating the
 * `@ai-sdk/react` Chat instance against the newly-picked session.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  MessageSquarePlusIcon,
  PencilIcon,
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/lib/utils/index";
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
  // The session being renamed (in the rename dialog), or null when closed.
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // The session-list dropdown opens on hover, not just click. Radix's
  // DropdownMenu has no hover trigger, so we control `open` and drive it
  // from pointer enter/leave on both the trigger and the content. A short
  // close delay bridges the gap between the two (the content is portaled a
  // few px below the trigger) so the menu doesn't flicker shut while the
  // pointer crosses it. Click still toggles it via `onOpenChange`.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while a row's "…" actions menu is open. The actions menu portals
  // outside the list content, so moving the pointer onto it fires the
  // list's mouseleave — without this guard the list would close out from
  // under the open menu.
  const actionsOpenRef = useRef(false);
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openMenu = () => {
    cancelClose();
    setMenuOpen(true);
  };
  const scheduleClose = () => {
    if (actionsOpenRef.current) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setMenuOpen(false), 150);
  };
  useEffect(() => cancelClose, []);

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
    setDraft(s.title);
    setRenameTargetId(s.id);
  };
  const commitRename = async () => {
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

  // Keep the hover list open while a row's actions menu is open; resume
  // the normal close-on-leave behaviour once it closes.
  const onRowActionsOpenChange = (open: boolean) => {
    actionsOpenRef.current = open;
    if (open) cancelClose();
    else scheduleClose();
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
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
              // Fit-to-content, not flex-1: a grown trigger turns the empty
              // space beside a short title into a hover target that opens the
              // menu. `min-w-0` keeps it shrinkable so long titles truncate.
              className="flex min-w-0 items-center gap-1 truncate text-left text-muted-foreground hover:text-foreground"
            >
              <span className="truncate">{currentTitle}</span>
              <ChevronDownIcon className="size-3 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-64"
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
          >
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
                  onOpenChange={onRowActionsOpenChange}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
              <MessageSquarePlusIcon className="size-3.5" />
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

      <Dialog
        open={renameTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTargetId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Give this chat a new name.</DialogDescription>
          </DialogHeader>
          <Input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitRename();
              }
            }}
            placeholder="Chat name"
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTargetId(null)}>
              Cancel
            </Button>
            <Button onClick={() => void commitRename()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
 * the hover session list, so the two stay in lock-step. Pass
 * `onOpenChange` from a row so the hover list can stay open while this
 * menu is.
 */
function SessionActionsMenu({
  session: s,
  onRename,
  onDelete,
  onOpenChange,
}: {
  session: SessionRow;
  onRename: (s: SessionRow) => void;
  onDelete: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
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
