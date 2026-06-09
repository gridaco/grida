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
} from "@app/ui/ai-elements/conversation";
import { cn } from "@app/ui/lib/utils";
import {
  AGENT_SESSION_AGENT,
  sessions as bridgeSessions,
  type Workspace,
} from "@/lib/desktop/bridge";
import {
  welcome_handoff,
  type WelcomeHandoff,
} from "@/lib/desktop/welcome-handoff";
import _models from "@grida/ai-models";
import {
  buildAgentSend,
  desktopAgentTransport,
  isSessionBusy,
  useChatSession,
  useCoreTurnSync,
  useRefreshOnStreamEnd,
  useSessionFork,
  useSessionStatus,
  useTurnQueueController,
  type ChatMessage,
} from "@/lib/agent-chat";
import {
  ChatMessageView,
  CompactingIndicator,
  ForkedNotice,
  type ChatMessageActions,
} from "@/kits/agent-chat";
import { QueuedMessages } from "../shared/queued-messages";
import { ChatSessionPicker } from "../shared/chat-session-picker";
import {
  DesktopModelPicker,
  useModelPickerState,
} from "../shared/model-picker";
import { DesktopContextMeter } from "../shared/context-meter";
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
  // start; consumed + sent in the auto-send effect below. Carries the
  // composer's model pick so the first turn runs on it (see the model
  // state seed below).
  const handoffRef = useRef<WelcomeHandoff | null | undefined>(undefined);
  if (handoffRef.current === undefined) {
    handoffRef.current = welcome_handoff.peek(workspace.id);
  }
  const handoff = handoffRef.current;
  const handoffPrompt = handoff?.prompt ?? null;

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
    resumeStream,
  } = useChat({
    chat,
    resume: true,
  });
  // `isStreaming` = a turn is actively streaming THROUGH THIS CLIENT. Used
  // where that is the honest concept: the typing indicator, the Stop/Send
  // button, and "did I start this turn?" (vs. the core). It is the AI-SDK
  // client's optimistic per-request status — NOT the authoritative session
  // state.
  const isStreaming = status === "submitted" || status === "streaming";

  // Manual compaction (RFC `session / compaction`) runs as a separate op that
  // does NOT move `useChat` status. Declared here so the single `busy` signal
  // below can fold it in; the `/compact` command is wired further down.
  const [compacting, setCompacting] = useState(false);

  // Authoritative core run-state (RFC `session / session status`): the fact the
  // UI projects, not the AI-SDK client's optimism. `coreBusy` covers a turn
  // running on the session even one this client hasn't attached to yet (a queue
  // drain the core just started).
  const coreStatus = useSessionStatus(chatSession.current_id);
  const coreBusy =
    coreStatus?.state === "busy" || coreStatus?.state === "retrying";

  // The session-busy signal — the SINGLE source for "is this session occupied
  // and may not start another op." Combines the client-local view (streaming or
  // an in-flight compaction) with the authoritative core state, so every
  // session-op gate (queue submit, rewind, fork, compact, per-message actions)
  // agrees on "busy" and a core-started turn also gates submits to enqueue.
  const busy = isSessionBusy(status, compacting) || coreBusy;
  // Block the reconcile while a turn is live — streaming locally OR a core turn
  // this client is (about to be) attached to. NOT compacting: a compaction is
  // idle to both signals and its rehydrate MUST reconcile. Read via a ref so
  // the effect runs only on an `initial_messages` change.
  const reconcileBlockedRef = useRef(false);
  reconcileBlockedRef.current = isStreaming || coreBusy;

  // Reconcile the live chat to the persisted transcript whenever a rewind or
  // compaction replaces it. The `chat` memo above rebuilds on
  // `initialMessages`, but useChat does not reliably reflect the swapped
  // instance on the first rebuild of a freshly-adopted session (the chat id
  // flips from client-generated to the server id), so the just-written
  // compaction divider can fail to render until a manual reload. Pushing the
  // hydrated messages in deterministically reconciles the render to DB truth.
  //
  // The `isStreaming` guard is the safety net: `initial_messages` is meant to
  // change only while idle (rewind/compaction run while `busy`; compaction
  // awaits `rehydrate_async` before clearing its busy flag — see onCompact),
  // but if a hydration ever lands as a drained turn starts to stream, this
  // would blindly overwrite the live turn. Skipping while streaming makes that
  // fail safe (a stale reconcile is dropped, not applied over a live turn).
  // Read via a ref so the effect still runs ONLY on an `initial_messages`
  // change — adding `isStreaming` as a dep would re-run it on stream-end and
  // re-apply a stale snapshot.
  useEffect(() => {
    if (reconcileBlockedRef.current) return;
    setMessages(chatSession.initial_messages);
  }, [chatSession.initial_messages, setMessages]);

  // Flat model selection (ignores tiers). Seeds from the welcome
  // composer's pick on a handed-off fresh session, otherwise from the
  // active session's stored model, and rides each send as `body.modelId`.
  const { model_id: modelId, setModelId } = useModelPickerState({
    current_id: chatSession.current_id,
    sessions: chatSession.sessions,
    initial: handoff?.model_id,
  });

  // Whether the active model accepts image input — memoized so the catalog
  // lookup doesn't re-scan on every render (only when the model changes).
  const multimodal = useMemo(
    () => _models.text.modelSpecById(modelId)?.multimodal ?? false,
    [modelId]
  );

  // The active session row carries the rolled-up cost the context meter
  // surfaces alongside the (real) window %.
  const activeSession = chatSession.sessions.find(
    (s) => s.id === chatSession.current_id
  );

  // On every turn end: refresh the sessions list (the sidecar writes the title
  // + usage after the last frame) AND bump `onMaybeMutated` (the agent may have
  // written files). This rides the AI-SDK stream-end, which fires for a local
  // turn AND a reconnected core-drained turn. Stable callback (refs) so the
  // edge hook never re-subscribes.
  const refreshRef = useRef(chatSession.refresh);
  refreshRef.current = chatSession.refresh;
  const onMaybeMutatedRef = useRef(onMaybeMutated);
  onMaybeMutatedRef.current = onMaybeMutated;
  const onStreamEnd = useCallback(() => {
    void refreshRef.current();
    onMaybeMutatedRef.current?.();
  }, []);
  useRefreshOnStreamEnd(status, onStreamEnd);

  // Turn queue (RFC `queue`): a submit while the session is busy enqueues; the
  // CORE fires queued items serially on a clean idle edge (the drain is core
  // state — not this client). `useTurnQueueController` owns the submit gate +
  // the optimistic mirror, shared with `ai-sidebar/chat.tsx`. Skills ride the
  // live `send` from the active tab; a core-drained turn uses the session's
  // discovered skills (no per-send subset — the renderer has no tab there).
  const {
    queued,
    cancel: cancelQueued,
    drop: dropQueued,
    submit: onSubmit,
    refetch: refetchQueue,
  } = useTurnQueueController({
    sessionId: chatSession.current_id,
    busy,
    send: buildAgentSend({
      sendMessage,
      sessionId: chatSession.current_id,
      modelId,
      skills: skillsForActiveTab(activeRelPath),
    }),
  });

  // React to the CORE drain (RFC `queue`): when the core fires a queued turn (a
  // busy edge THIS client did not start), `useCoreTurnSync` promotes the fired
  // message from the tray into the transcript and attaches to its stream. The
  // core dequeues the row at FIRE time (not during the cooldown), so it stays
  // in the tray as pending until then — "submitting" in step with its response.
  useCoreTurnSync({
    coreState: coreStatus?.state ?? null,
    isStreaming,
    queued,
    setMessages,
    dropQueued,
    resumeStream,
    refetchQueue,
  });

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
      if (!sid || busy) return;
      try {
        await bridgeSessions.rewind(sid, messageId);
        chatSession.rehydrate();
        clearError();
      } catch (err) {
        console.warn("[agent-pane] rewind failed", err);
      }
    },
    [chatSession, busy, clearError]
  );

  // Fork (RFC `session / fork`): the action + its "just forked" notice live
  // in one hook so every entry point (the per-message button and the `/fork`
  // command below) shares the same behavior and feedback. Blocked while busy
  // (a fork mid-compaction would copy a half-written summary).
  const { fork, just_forked: justForked } = useSessionFork(chatSession, busy);

  // Manual compaction (RFC `session / compaction`): summarize earlier turns to
  // free context, then re-hydrate so the summary + tail show. `compacting`
  // (declared above, where the queue controller reads it) drives the in-flight
  // divider+shimmer. Await `rehydrate_async` BEFORE clearing the busy flag so
  // the compacted transcript reconciles before the queue drains — otherwise a
  // queued message would fire against the stale view and the late hydration
  // would clobber the in-flight turn (RFC `queue`).
  const onCompact = useCallback(async () => {
    const sid = chatSession.current_id;
    // `busy` already folds in `compacting`, so this also blocks re-entrant
    // compaction.
    if (!sid || busy) return;
    setCompacting(true);
    try {
      await bridgeSessions.compact(sid);
      await chatSession.rehydrate_async();
      clearError();
    } catch (err) {
      console.warn("[agent-pane] compact failed", err);
    } finally {
      setCompacting(false);
    }
  }, [chatSession, busy, clearError]);

  // `/fork` command: the no-target sibling of the per-message fork. With no
  // chosen message it forks at the tail — the whole conversation.
  const onForkCommand = useCallback(() => {
    const fromMessageId = messages.at(-1)?.id;
    if (!fromMessageId) return;
    return fork(fromMessageId);
  }, [fork, messages]);

  // `disabled` flips with `busy` (rewind/fork are session ops — disabled during
  // a turn AND a compaction), so settled rows skip re-render off that edge.
  const messageActions = useMemo<ChatMessageActions>(
    () => ({ onRewind, onFork: fork, disabled: busy }),
    [onRewind, fork, busy]
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

      <QueuedMessages queued={queued} onCancel={cancelQueued} />

      <div className="shrink-0 border-t p-3">
        <AgentComposerInput
          catalog={catalog}
          commandActions={commandActions}
          onSubmit={onSubmit}
          isStreaming={isStreaming}
          busy={busy}
          onStop={stop}
          multimodal={multimodal}
          toolbar={
            <>
              <DesktopModelPicker value={modelId} onValueChange={setModelId} />
              <DesktopContextMeter
                messages={messages}
                modelId={modelId}
                costUsd={activeSession?.cost_usd}
              />
            </>
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
