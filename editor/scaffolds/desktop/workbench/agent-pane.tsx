/**
 * Workspace agent pane — the generic agent over the user's workspace.
 *
 * The agent runs inside the agent sidecar (fs bound to a `NodeFsBackend` rooted
 * at `workspace.root`, plus agent-sidecar internal shell wired through the
 * existing allowlist + cwd-containment checks). The renderer is
 * observe-only for tool calls — no renderer `onToolCall` resolver is
 * supplied, so agent sidecar-owned tool chunks flow straight through the AI
 * SDK UI-message stream.
 *
 * Per /sdk-design — this file is a *view*. The headless brain lives
 * in `@/lib/agent-chat` (the bridge `ChatTransport` and display
 * helpers). The standalone-doc chat (`scaffolds/desktop/ai-sidebar/`)
 * uses the same brain with different glue (no workspaceId, with fs
 * binding). Lifting their views into one component would bake in
 * choices that diverge — context strip, empty-state copy, scroll
 * behaviour — so we don't.
 *
 * Skill selection follows the active tab's extension: `.svg` → load
 * the `'svg'` skill block; anything else → no skill (the agent uses
 * the generic core prompt). Recomputed per send so flipping tabs
 * mid-conversation just affects subsequent turns.
 *
 * V1 boundary: the agent operates on disk; the open editor pane
 * doesn't see writes mid-session. Closing and reopening the tab
 * picks up agent edits. A live-binding follow-up is tracked in the
 * promotion plan.
 */

"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { cn } from "@/components/lib/utils/index";
import {
  AGENT_SESSION_AGENT,
  sessions as bridgeSessions,
  type Workspace,
} from "@/lib/desktop/bridge";
import { welcome_handoff } from "@/lib/desktop/welcome-handoff";
import {
  desktopAgentTransport,
  useChatSession,
  useRefreshOnStreamEnd,
  useSessionFork,
  type ChatMessage,
} from "@/lib/agent-chat";
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
import { useWorkspaceComposerCatalog } from "../shared/use-workspace-composer-catalog";

/** Skill ids the workspace agent knows about. New ids land here when
 * their prompt block + tool wiring exist in `@grida/agent`. */
const SVG_EXTENSIONS = new Set([".svg"]);

function getExtension(relPath: string): string {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot).toLowerCase();
}

function skillsForActiveTab(relPath: string | null): string[] | undefined {
  if (relPath === null) return undefined;
  // TODO(skill-system): replace this extension heuristic with a real
  // workspace skill picker/registry once format-specific skills exist
  // beyond this SVG-only path.
  if (SVG_EXTENSIONS.has(getExtension(relPath))) return ["svg"];
  return undefined;
}

export type AgentPaneProps = {
  workspace: Workspace;
  /** The file currently in focus in the editor pane. Drives skill
   * selection — when it changes, subsequent turns pick up the new
   * skill set. */
  activeRelPath?: string | null;
  className?: string;
  /**
   * Bumped after a successful agent turn so the file tree pane can pick
   * up new / modified files. Today the workspace chat can't know
   * whether the agent wrote anything; we just bump on every settled
   * turn. The file tree pane's re-load is cheap.
   */
  onMaybeMutated?: () => void;
};

export function AgentPane({
  workspace,
  activeRelPath = null,
  className,
  onMaybeMutated,
}: AgentPaneProps) {
  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <AgentPaneContent
        workspace={workspace}
        activeRelPath={activeRelPath}
        onMaybeMutated={onMaybeMutated}
      />
    </div>
  );
}

type AgentPaneContentProps = Omit<AgentPaneProps, "className">;

function AgentPaneContent({
  workspace,
  activeRelPath = null,
  onMaybeMutated,
}: AgentPaneContentProps) {
  // Prompt handed off from the welcome composer. Peeked once (cached in a
  // ref so it stays stable after we clear it) to decide a fresh-session
  // start; consumed + sent in the auto-send effect below.
  const handoffRef = useRef<string | null | undefined>(undefined);
  if (handoffRef.current === undefined) {
    handoffRef.current = welcome_handoff.peek(workspace.id);
  }
  const handoffPrompt = handoffRef.current;

  // Composer catalog: `@` file references + `/` skill commands.
  const catalog = useWorkspaceComposerCatalog(workspace.id);

  // Sessions scoped to this workspace's single Grida agent. A handed-off
  // prompt forces a fresh session so it never appends to the last chat.
  const chatSession = useChatSession({
    agent: AGENT_SESSION_AGENT,
    workspaceId: workspace.id,
    force_new: handoffPrompt != null,
  });

  // `chatRef` exposes the chat instance to the transport's
  // `onResumeStart` hook, which can't close over `chat` since that
  // variable doesn't exist yet at closure-construction time.
  const chatRef = useRef<Chat<UIMessage> | null>(null);
  const chat = useMemo(
    () => {
      const instance = new Chat<UIMessage>({
        id: chatSession.current_id ?? undefined,
        messages: chatSession.initial_messages,
        transport: desktopAgentTransport.create({
          workspace_id: workspace.id,
          session_id: chatSession.current_id ?? undefined,
          onSessionId: (resolvedId) => {
            chatSession.apply_resolved_session_id(resolvedId);
          },
          onResumeStart: () => {
            // AgentHost confirmed an in-flight run — drop the unfinished
            // assistant we hydrated from the DB so the replay rebuilds
            // it cleanly.
            const cur = chatRef.current;
            if (!cur) return;
            const last = cur.messages.at(-1);
            if (last?.role === "assistant") {
              cur.messages = cur.messages.slice(0, -1);
            }
          },
        }),
      });
      chatRef.current = instance;
      return instance;
    },
    // Rebuild ONLY on a real session switch / new chat (or workspace change)
    // — signalled by `initialMessages` changing (hydration). `currentId` is
    // intentionally NOT a dep: when the live fresh chat adopts its server id
    // mid-stream (`apply_resolved_session_id`), rebuilding here would orphan the
    // in-flight first response. Continuity rides the per-send `body.sessionId`
    // below; `useChatSession` suppresses the adoption hydrate so this memo
    // sees no `initialMessages` change for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.id, chatSession.initial_messages]
  );
  // `resume: true` — AI SDK v6 built-in. On mount the SDK calls our
  // transport's `reconnectToStream({chatId})`; the transport returns
  // null on 404 (no in-flight run) → clean no-op; on success the
  // agent sidecar replays from its chunk log and live-tails until finish.
  // See `bridge-transport.ts` + `agent/stream-registry.ts`.
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
      const skills = skillsForActiveTab(activeRelPath);
      // Thread the session id live (not via the transport's creation-time
      // default) so a fresh chat that adopted its id mid-first-turn still
      // sends it next turn without the `Chat` being rebuilt.
      await sendMessage(
        { text: t },
        {
          body: {
            session_id: chatSession.current_id ?? undefined,
            skills,
            model_id: modelId,
          },
        }
      );
      onMaybeMutated?.();
    },
    [
      isStreaming,
      sendMessage,
      activeRelPath,
      modelId,
      onMaybeMutated,
      chatSession.current_id,
    ]
  );

  // Welcome-composer handoff: send the stashed prompt once as the first
  // turn. Wait for the session list to settle (loading=false) so the
  // forced-new null session is in place, then consume + send. Ref-guarded
  // so re-renders — and the onSubmit identity change after the fresh
  // session adopts its id — can't re-fire it.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!handoffPrompt || autoSentRef.current || chatSession.loading) return;
    autoSentRef.current = true;
    welcome_handoff.clear(workspace.id);
    void onSubmit(handoffPrompt);
  }, [handoffPrompt, chatSession.loading, onSubmit, workspace.id]);

  // Rewind: soft-truncate to the chosen user message, then re-hydrate.
  const onRewind = useCallback(
    async (messageId: string) => {
      const sid = chatSession.current_id;
      if (!sid || isStreaming) return;
      try {
        await bridgeSessions.rewind(sid, messageId);
        chatSession.rehydrate();
        clearError();
      } catch (err) {
        console.warn("[agent-pane] rewind failed", err);
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

  // Manual compaction (RFC `session / compaction`): summarize earlier
  // turns to free context, then re-hydrate so the summary + tail show.
  // `compacting` drives the in-flight divider+shimmer until the settled
  // `data-compaction` summary hydrates.
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
      console.warn("[agent-pane] compact failed", err);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatSessionPicker
        session={chatSession}
        defaultTitle="Agent"
        onSelect={(id) => chatSession.select(id)}
        conversationEmpty={messages.length === 0}
      />
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="gap-4 px-3 py-4">
          {/* Empty state intentionally omitted — the chat starts blank
              and the prompt input below is the only affordance the
              user needs to begin. No "Ask the workspace agent" hero,
              no example prompts; the surface stays quiet until used. */}
          {settledList}
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
          catalog={catalog}
          commandActions={commandActions}
          onSubmit={onSubmit}
          isStreaming={isStreaming}
          onStop={stop}
          toolbar={
            <DesktopModelPicker value={modelId} onValueChange={setModelId} />
          }
        />
      </div>
    </div>
  );
}

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
