/**
 * Desktop AI sidebar chat — wire-driven, single-document.
 *
 * Talks to `AgentSidecar` via an AI SDK `ChatTransport` over the desktop
 * bridge, and resolves fs tool calls locally against the live
 * `SvgEditor` via {@link useAgentFsBinding}.
 * Presentation is built on the repo's `@/components/ai-elements/*`
 * primitives so the panel matches the web `/svg` route's shape.
 *
 * GRIDA-SEC-004 — error / finish chunks are surfaced via the `error`
 * banner, not swallowed. The user must be able to tell when the
 * agent sidecar dropped a stream rather than watch a forever-spinner.
 */

"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import { AgentFs } from "@grida/agent/fs";
import { AgentTodos } from "@grida/agent/todos";
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { SparklesIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { cn } from "@/components/lib/utils/index";
import type { ComposerCatalog } from "@/kits/composer";
import {
  AGENT_SESSION_AGENT,
  sessions as bridgeSessions,
} from "@/lib/desktop/bridge";
import {
  desktopAgentTransport,
  useChatSession,
  useRefreshOnStreamEnd,
  useSessionFork,
  type ChatMessage,
} from "@/lib/agent-chat";
import { useAgentFsBinding } from "./agent-fs-binding";
import {
  ChatMessageView,
  CompactingIndicator,
  ForkedNotice,
  type ChatMessageActions,
} from "@/kits/agent-chat";
import { ChatSessionPicker } from "../shared/chat-session-picker";
import {
  DesktopModelPicker,
  useModelPickerState,
} from "../shared/model-picker";
import {
  AgentComposerInput,
  type ComposerCommandAction,
} from "../shared/agent-composer-input";

// Standalone-doc surface: no workspace, so no file mentions or skill
// commands — the composer is still the input for its rich-text + paste UX.
const EMPTY_CATALOG: ComposerCatalog = { commands: [], mentions: [] };

export function AISidebarChat({ className }: { className?: string }) {
  const { fs } = useAgentFsBinding();

  // Chat-session lifecycle: list, pick, hydrate. Filter is fixed
  // (`agent: "grida"`, no workspace) — this panel is the standalone-doc
  // surface.
  const chatSession = useChatSession({ agent: AGENT_SESSION_AGENT });

  // The `Chat` instance is rebuilt per real session switch / new chat (keyed
  // on hydrated `initialMessages`; see the memo deps below), NOT when a fresh
  // chat adopts its server id mid-stream. `chatRef` lets the `onResumeStart`
  // callback mutate the chat's messages once a resume is happening — it can't
  // close over `chat`, which doesn't exist yet at closure-construction time.
  const chatRef = useRef<Chat<UIMessage> | null>(null);
  const chat = useMemo(() => {
    const todos = new AgentTodos();
    const chat = new Chat<UIMessage>({
      id: chatSession.current_id ?? undefined,
      messages: chatSession.initial_messages,
      transport: desktopAgentTransport.create({
        session_id: chatSession.current_id ?? undefined,
        onSessionId: (resolvedId) => {
          chatSession.apply_resolved_session_id(resolvedId);
        },
        onResumeStart: () => {
          // AgentHost confirmed an in-flight run for this chat id; drop
          // the in-progress assistant message we hydrated from the DB
          // so the registry's full replay rebuilds it cleanly instead
          // of stacking duplicate parts.
          const cur = chatRef.current;
          if (!cur) return;
          const last = cur.messages.at(-1);
          if (last?.role === "assistant") {
            cur.messages = cur.messages.slice(0, -1);
          }
        },
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onToolCall: ({ toolCall }) => {
        const agentToolCall = {
          tool_name: toolCall.toolName,
          tool_call_id: toolCall.toolCallId,
          input: toolCall.input,
          dynamic: toolCall.dynamic,
        };
        const output =
          AgentFs.resolveToolCall(fs, agentToolCall) ??
          AgentTodos.resolveToolCall(todos, agentToolCall);
        if (output === undefined) return;
        void chat.addToolResult({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
      },
    });
    chatRef.current = chat;
    return chat;
    // Rebuild ONLY on a real session switch / new chat — signalled by
    // `initialMessages` changing (hydration). `currentId` is intentionally
    // NOT a dep: when the live fresh chat adopts its server id mid-stream
    // (`apply_resolved_session_id`), rebuilding here would orphan the in-flight
    // first response (it streams into the discarded instance). Continuity
    // rides the per-send `body.sessionId` below, and `useChatSession`
    // suppresses the adoption hydrate so this memo sees no `initialMessages`
    // change for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, chatSession.initial_messages]);

  // `resume: true` is the AI SDK v6 built-in for "on mount, ask the
  // transport to reconnect to any in-flight run for this chat id."
  // Same behavior as a manual `useEffect(() => chat.resumeStream(), …)`,
  // just less code. Our transport returns null on the agent sidecar's 404 →
  // clean no-op; on success the agent sidecar replays from its in-memory
  // chunk log and live-tails until finish. See `bridge-transport.ts`
  // for the renderer side and `agent/stream-registry.ts` for the
  // agent sidecar's chunk log + multiplex.
  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    clearError,
    setMessages,
  } = useChat({
    chat,
    resume: true,
  });
  const isStreaming = status === "submitted" || status === "streaming";

  // Reconcile the live chat to the persisted transcript whenever a rewind or
  // compaction replaces it. The `chat` memo above rebuilds on
  // `initialMessages`, but useChat does not reliably reflect the swapped
  // instance on the first rebuild of a freshly-adopted session (the chat id
  // flips from client-generated to the server id), so the just-written
  // compaction divider can fail to render until a manual reload. Pushing the
  // hydrated messages in deterministically reconciles the render to DB truth.
  // No-op during streaming/adoption — `initialMessages` is unchanged there, so
  // a live turn is never clobbered.
  useEffect(() => {
    setMessages(chatSession.initial_messages);
  }, [chatSession.initial_messages, setMessages]);

  // Flat model selection (ignores tiers). Seeds from the active
  // session's stored model and rides each send as `body.modelId`.
  const { model_id: modelId, setModelId } = useModelPickerState({
    current_id: chatSession.current_id,
    sessions: chatSession.sessions,
  });

  // Pull a fresh sessions list every time a turn finishes. The agent sidecar
  // writes the auto-generated title + final usage counters AFTER the
  // chat stream's last frame — without this, the picker keeps showing
  // "New Chat" until the renderer is reloaded.
  useRefreshOnStreamEnd(status, chatSession.refresh);

  const onSubmit = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || isStreaming) return;
      // Thread the session id live (not via the transport's creation-time
      // default) so a fresh chat that adopted its id mid-first-turn still
      // sends it on the next turn without the `Chat` being rebuilt.
      await sendMessage(
        { text: t },
        {
          body: {
            session_id: chatSession.current_id ?? undefined,
            model_id: modelId,
          },
        }
      );
    },
    [isStreaming, sendMessage, modelId, chatSession.current_id]
  );

  // Rewind (RFC `session / rewinding`): soft-truncate the session to the
  // chosen user message, then re-hydrate so the transcript drops the now-
  // hidden tail. Blocked while a run is in flight (the host also 409s).
  const onRewind = useCallback(
    async (messageId: string) => {
      const sid = chatSession.current_id;
      if (!sid || isStreaming) return;
      try {
        await bridgeSessions.rewind(sid, messageId);
        chatSession.rehydrate();
        clearError();
      } catch (err) {
        console.warn("[ai-sidebar] rewind failed", err);
      }
    },
    [chatSession, isStreaming, clearError]
  );

  // Fork (RFC `session / fork`): the action + its "just forked" notice live
  // in one hook so every entry point (the per-message button and the `/fork`
  // command below) shares the same behavior and feedback.
  const { fork, just_forked: justForked } = useSessionFork(
    chatSession,
    isStreaming
  );

  // Manual compaction (RFC `session / compaction`). `compacting` drives the
  // in-flight divider+shimmer; the settled `data-compaction` summary renders
  // itself once `rehydrate()` re-fetches the session.
  const [compacting, setCompacting] = useState(false);
  const onCompact = useCallback(async () => {
    const sid = chatSession.current_id;
    if (!sid || isStreaming || compacting) return;
    setCompacting(true);
    try {
      await bridgeSessions.compact(sid);
      chatSession.rehydrate();
      clearError();
    } catch (err) {
      console.warn("[ai-sidebar] compact failed", err);
    } finally {
      setCompacting(false);
    }
  }, [chatSession, isStreaming, compacting, clearError]);

  // `/fork` command: the no-target sibling of the per-message fork. With no
  // chosen message it forks at the tail — the whole conversation.
  const onForkCommand = useCallback(() => {
    const fromMessageId = messages.at(-1)?.id;
    if (!fromMessageId) return;
    return fork(fromMessageId);
  }, [fork, messages]);

  // Stable per-turn affordances. `disabled` flips with streaming, so the
  // object identity changes only on stream start/stop — settled rows skip
  // re-render otherwise (reference-equal props).
  const messageActions = useMemo<ChatMessageActions>(
    () => ({ onRewind, onFork: fork, disabled: isStreaming }),
    [onRewind, fork, isStreaming]
  );

  const commandActions = useMemo<ComposerCommandAction[]>(
    () => [
      {
        id: "compact",
        title: "compact",
        description: "Summarize earlier turns to free up context",
        run: onCompact,
      },
      {
        id: "fork",
        title: "fork",
        description: "Fork this conversation into a new session",
        run: onForkCommand,
      },
    ],
    [onCompact, onForkCommand]
  );

  // Settled history renders independently of the streaming row, so
  // per-chunk updates that touch only `state.streaming` don't
  // re-render these.
  const settledList = useMemo(
    () =>
      messages.map((m, index) => (
        <ChatMessageMemo
          key={m.id}
          message={m}
          isStreaming={isStreaming && index === messages.length - 1}
          actions={m.role === "user" ? messageActions : undefined}
        />
      )),
    [messages, isStreaming, messageActions]
  );

  const isEmpty = messages.length === 0;

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <ChatSessionPicker
        session={chatSession}
        icon={<SparklesIcon className="size-3.5 text-primary" />}
        defaultTitle="Agent"
        onSelect={(id) => chatSession.select(id)}
        conversationEmpty={isEmpty}
      />

      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="gap-4 px-3 py-4">
          {isEmpty ? (
            <ConversationEmptyState
              icon={<SparklesIcon className="size-5" />}
              title="Start a conversation"
              description="Ask the assistant to draw or edit the SVG. You can drag and color shapes between turns."
            />
          ) : (
            settledList
          )}
          {compacting && <CompactingIndicator />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {justForked && <ForkedNotice />}

      {error && (
        <div className="flex items-start gap-2 border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="flex-1">{error.message}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-destructive/70 underline hover:text-destructive"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="shrink-0 border-t p-3">
        <AgentComposerInput
          catalog={EMPTY_CATALOG}
          commandActions={commandActions}
          onSubmit={onSubmit}
          isStreaming={isStreaming}
          onStop={stop}
          placeholder="Ask the assistant to edit the SVG…"
          toolbar={
            <DesktopModelPicker value={modelId} onValueChange={setModelId} />
          }
        />
      </div>
    </div>
  );
}

/**
 * Memoized row. Equality check is reference-based — the reducer
 * keeps settled messages' references stable, so the row is skipped
 * during streaming-row mutations.
 */
const ChatMessageMemo = memo(function ChatMessageMemo({
  message,
  isStreaming,
  actions,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  actions?: ChatMessageActions;
}) {
  return (
    <ChatMessageView
      message={message}
      isStreaming={isStreaming}
      actions={actions}
    />
  );
});
