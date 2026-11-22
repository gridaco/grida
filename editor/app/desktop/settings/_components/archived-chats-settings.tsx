"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ArchiveRestoreIcon, Loader2, RefreshCwIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { toast } from "sonner";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import type { SettingsArchives } from "@/lib/desktop/settings-archives";
import { ChatActivityDate } from "@/scaffolds/desktop/shared/chat-activity-date";
import { SettingsSection } from "./settings-layout";

export function ArchivedChatsSettings({
  controller,
}: {
  controller: SettingsArchives.Controller;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useEffect(() => {
    const refresh = () => void controller.refresh();
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [controller]);
  const busy = state.loading || state.restoring !== null;

  async function unarchive(id: string) {
    if (!(await controller.unarchive(id))) return;
    const openRestored = getDesktopBridge()?.archives?.openRestored;
    toast("Chat unarchived", {
      icon: <ArchiveRestoreIcon aria-hidden className="size-4" />,
      action: openRestored && {
        label: "View",
        onClick: () => {
          void openRestored(id).catch(() => {
            toast.error("Couldn't open this chat.");
          });
        },
      },
    });
  }

  return (
    <SettingsSection
      title="Archived chats"
      description="Restore a chat to its workspace’s chat list."
      data-testid="settings-archived-chats"
      action={
        state.supported && (
          <Button
            className="shrink-0"
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh archived chats"
            disabled={busy}
            onClick={() => void controller.refresh()}
          >
            <RefreshCwIcon className="size-4" />
          </Button>
        )
      }
    >
      {state.loading && state.entries.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading archived chats…
        </p>
      ) : !state.supported ? (
        <p className="text-sm text-muted-foreground">
          Update Desktop to manage archived chats here.
        </p>
      ) : (
        <>
          {state.unavailableWorkspaces.length > 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              Some workspaces couldn&apos;t be checked:{" "}
              {state.unavailableWorkspaces.join(", ")}. Refresh to try again.
            </p>
          )}
          {state.entries.length === 0 &&
            !state.error &&
            state.unavailableWorkspaces.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No archived chats.
              </p>
            )}
          <ul className="divide-y rounded-xl border empty:hidden">
            {state.entries.map((chat) => (
              <li key={chat.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {chat.title || "Untitled chat"}
                  </p>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={chat.workspace}
                  >
                    {chat.workspace}
                  </p>
                </div>
                <ChatActivityDate atMs={chat.lastActivityAtMs} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-label={`Unarchive ${chat.title || "Untitled chat"}`}
                  onClick={() => void unarchive(chat.id)}
                >
                  {state.restoring === chat.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArchiveRestoreIcon className="size-3.5" />
                  )}
                  Unarchive
                </Button>
              </li>
            ))}
          </ul>
          {state.nextCursor && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void controller.more()}
            >
              {state.loading && <Loader2 className="size-3.5 animate-spin" />}
              Load more
            </Button>
          )}
        </>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </SettingsSection>
  );
}
