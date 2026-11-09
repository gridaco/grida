"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { DesktopNativeChat } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@app/ui/ai-elements/conversation";
import { ChatMessageView, PendingTurnIndicator } from "@/kits/agent-chat";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import { AgentComposerInput } from "../shared/agent-composer-input";

const TEXT_CATALOG = { commands: [], mentions: [] };
const selectionMemory = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};

export function NativeAgentPane({
  bridge,
  workspaceId,
  initialSession,
}: {
  bridge: DesktopNativeChat;
  workspaceId: string;
  initialSession: string | null;
}) {
  const controller = useMemo(
    () =>
      new NativeChatController(
        bridge,
        selectionMemory,
        `grida.nativeChat.${workspaceId}`
      ),
    [bridge, workspaceId]
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useEffect(() => {
    controller.connect(initialSession);
    return () => controller.disconnect();
  }, [controller, initialSession]);
  const snapshot = state.observation?.snapshot;
  const turn = snapshot?.current;
  const running =
    turn?.disposition === "running" && !turn.paused && !turn.cancelled;
  const canResume =
    turn?.disposition === "suspended" && turn.paused && !turn.cancelled;
  const canStop = !!turn && !turn.cancelled;
  const canSubmit =
    !state.loading && !state.acting && !turn && !snapshot?.admissionPaused;
  const status = state.loading
    ? "Opening chat…"
    : state.repairing
      ? "Refreshing messages…"
      : turn?.cancelled
        ? "Stopping…"
        : canResume
          ? "Paused"
          : turn?.paused
            ? "Pausing…"
            : turn?.disposition === "suspended"
              ? "Waiting for input"
              : turn?.disposition === "interrupted"
                ? "Interrupted"
                : running
                  ? "Working…"
                  : snapshot?.admissionPaused
                    ? "Stopped"
                    : snapshot?.queuedInputs
                      ? "Message queued"
                      : snapshot?.latest?.status === "failed"
                        ? "Task failed"
                        : snapshot?.latest?.status === "uncertain"
                          ? "Task result uncertain"
                          : null;

  return (
    <div
      data-testid="workspace-native-chat"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <select
          aria-label="Chat"
          className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1 text-xs"
          value={state.selected ?? ""}
          onChange={(event) =>
            void controller.select(event.currentTarget.value || null)
          }
        >
          <option value="">New Chat</option>
          {state.selected && !state.sessions.includes(state.selected) && (
            <option value={state.selected}>Current Chat</option>
          )}
          {state.sessions.map((id) => (
            <option key={id} value={id}>
              Chat {id.slice(0, 8)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void controller.select(null)}
        >
          New Chat
        </Button>
      </div>
      {(state.catalogCursor ||
        state.nextCatalogCursor ||
        state.catalogLoading ||
        state.catalogError) && (
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
          <span role="status">
            {state.catalogLoading ? "Loading saved chats…" : state.catalogError}
          </span>
          {(state.catalogCursor || state.catalogError) && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.catalogLoading}
              onClick={() => void controller.listChats()}
            >
              {state.catalogCursor ? "Newest chats" : "Retry list"}
            </Button>
          )}
          {state.nextCatalogCursor && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.catalogLoading}
              onClick={() => void controller.listChats(state.nextCatalogCursor)}
            >
              Older chats
            </Button>
          )}
        </div>
      )}
      <Conversation
        className="min-h-0 flex-1"
        initial="instant"
        resize={running ? "smooth" : "instant"}
      >
        <ConversationContent className="gap-4 px-3 py-4">
          {state.messages.map((message) => (
            <ChatMessageView
              key={message.messageId}
              message={{
                id: message.messageId,
                role: message.role,
                parts: [{ type: "text", text: message.text }],
              }}
            />
          ))}
          {running && state.messages.at(-1)?.role !== "assistant" && (
            <PendingTurnIndicator />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {status && (
        <div role="status" className="px-3 pt-2 text-xs text-muted-foreground">
          {status}
        </div>
      )}
      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 pt-2 text-xs text-destructive"
        >
          <span className="flex-1">{state.error}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void controller.repair()}
          >
            Refresh
          </Button>
        </div>
      )}
      <div className="shrink-0 p-3">
        <AgentComposerInput
          key={state.scope}
          catalog={TEXT_CATALOG}
          attach={false}
          operableFiles={false}
          awaitSubmission
          canSubmit={canSubmit}
          busy={!!turn}
          isStreaming={running}
          submissionScope={state.scope}
          onSubmit={(text) => controller.submit(text)}
          onStop={() => void controller.control("stop")}
          toolbarStart={
            running ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={state.acting}
                onClick={() => void controller.control("pause")}
              >
                Pause
              </Button>
            ) : canResume ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={state.acting}
                onClick={() => void controller.control("resume")}
              >
                Resume
              </Button>
            ) : null
          }
          toolbarEnd={
            !running && canStop ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={state.acting}
                onClick={() => void controller.control("stop")}
              >
                Stop
              </Button>
            ) : null
          }
        />
      </div>
    </div>
  );
}
