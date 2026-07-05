// GRIDA-GG: desktop — GG token/credit error UX (docs/wg/platform/hosted-ai.md)
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
import { useSearchParams } from "next/navigation";
import { Chat, useChat } from "@ai-sdk/react";
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@app/ui/ai-elements/conversation";
import { ImagesIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import {
  AGENT_SESSION_AGENT,
  getDesktopBridge,
  sessions as bridgeSessions,
  type AgentRunOptions,
  type Workspace,
} from "@/lib/desktop/bridge";
import * as gridaGateway from "@/lib/desktop/gg-session";
import {
  welcome_handoff,
  type WelcomeHandoff,
} from "@/lib/desktop/welcome-handoff";
import { useDesktopAgentFocusSession } from "@/lib/desktop/agent-focus-session";
import {
  buildAgentSend,
  buildApprovalResumeBody,
  desktopAgentTransport,
  isSessionBusy,
  useChatSession,
  useCoreTurnSync,
  useRefreshOnStreamEnd,
  useResumeInFlight,
  useSessionFork,
  useSessionStatus,
  useTurnQueueController,
  type ChatMessage,
} from "@/lib/agent-chat";
import {
  ChatMessageView,
  CompactingIndicator,
  ForkedNotice,
  PendingTurnIndicator,
  QuestionCard,
  findPendingQuestion,
  findPendingDesignSearch,
  type ChatMessageActions,
  type AnswerQuestionHandler,
  type PickReferencesHandler,
} from "@/kits/agent-chat";
import { pickQuery, type DesignSearchSession } from "./design-search-tab";
import { QueuedMessages } from "../shared/queued-messages";
import { ChatSessionPicker } from "../shared/chat-session-picker";
import {
  DesktopModelPicker,
  ModelToolCallNotice,
  useModelPickerState,
} from "../shared/model-picker";
import { DesktopModePicker, useModePickerState } from "../shared/mode-picker";
import { DesktopContextMeter } from "../shared/context-meter";
import {
  registered_models,
  useEndpointProviders,
} from "../shared/registered-models";
import {
  AgentComposerInput,
  type ComposerCommandAction,
} from "../shared/agent-composer-input";
import { useWorkspaceComposerCatalog } from "../shared/use-workspace-composer-catalog";

export type AgentPaneProps = {
  workspace: Workspace;
  /** The file currently in focus in the editor pane. */
  activeRelPath?: string | null;
  className?: string;
  /**
   * Bumped after a successful agent turn so the file tree pane can pick
   * up new / modified files. Today the workspace chat can't know
   * whether the agent wrote anything; we just bump on every settled
   * turn. The file tree pane's re-load is cheap.
   */
  onMaybeMutated?: () => void;
  /** Pushes the live `design_search` pick up to the workbench, which hosts the
   * picker as a dedicated editor-pane tab. null when no pick is pending. */
  onDesignSearchChange?: (session: DesignSearchSession | null) => void;
  /** Reopen/focus the picker tab — the affordance behind the in-pane note when
   * a pick is pending (e.g. after the user closed the tab). */
  onOpenPicker?: () => void;
};

export function AgentPane({
  workspace,
  activeRelPath = null,
  className,
  onMaybeMutated,
  onDesignSearchChange,
  onOpenPicker,
}: AgentPaneProps) {
  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <AgentPaneContent
        workspace={workspace}
        activeRelPath={activeRelPath}
        onMaybeMutated={onMaybeMutated}
        onDesignSearchChange={onDesignSearchChange}
        onOpenPicker={onOpenPicker}
      />
    </div>
  );
}

type AgentPaneContentProps = Omit<AgentPaneProps, "className">;

function AgentPaneContent({
  workspace,
  onMaybeMutated,
  onDesignSearchChange,
  onOpenPicker,
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

  // Click-to-attend (RFC `events.md` §click-to-attend): a notification
  // click focused this window and names the session to bring into view.
  // Two arrival paths, one handler:
  //   - live window — the AGENT_FOCUS_SESSION push the preload re-dispatches;
  //   - fresh window — the `session` URL param (a window opened by the click
  //     has no listener at load time, so the id rides the URL instead).
  // Guard: select only a session that belongs to THIS workspace. Main routes
  // the click by the session's workspace binding, so a mismatch is a routing
  // bug upstream — fail safe by ignoring it, never re-bind a foreign session
  // to this workspace's fs scope. `select` is ref-held: `chatSession` is a
  // fresh object every render, and the subscription must not re-wire on it.
  const selectSessionRef = useRef(chatSession.select);
  selectSessionRef.current = chatSession.select;
  const focusSession = useCallback(
    (sessionId: string) => {
      void (async () => {
        try {
          const row = await bridgeSessions.get(sessionId);
          if (!row || row.workspace_id !== workspace.id) return;
          selectSessionRef.current(sessionId);
        } catch {
          // Unknown/unreachable session — ignore; the window focus alone
          // already brought the user to the right workspace.
        }
      })();
    },
    [workspace.id]
  );
  useDesktopAgentFocusSession(focusSession);
  // The URL-param path, consumed once. No need to wait for the session-list
  // load: an explicit deep-link select wins over the async last-session
  // restore by design (the restore only fills a still-null selection).
  const params = useSearchParams();
  const focusParam = params.get("session");
  const consumedFocusParamRef = useRef(false);
  useEffect(() => {
    if (!focusParam || consumedFocusParamRef.current) return;
    consumedFocusParamRef.current = true;
    focusSession(focusParam);
  }, [focusParam, focusSession]);

  // `chatRef` mirrors the live `Chat` for the transport's `onResumeStart` hook,
  // which can't close over `chat` (that variable doesn't exist when the closure
  // is built). It is synced from the PASSIVE EFFECT below — NEVER assigned
  // inside `useMemo`. The factory must be pure: under React StrictMode it is
  // double-invoked, so a `chatRef.current = instance` side-effect there leaves
  // the ref pointing at the DISCARDED instance while `useChat` keeps the other.
  // The approval send (and onResumeStart) would then act on an EMPTY chat — no
  // assistant turn, so the resume's tool-output has no part to merge into
  // ("No tool invocation found"), the run never renders, and the approval bar
  // never clears until a hard refresh re-hydrates from the DB.
  const chatRef = useRef<Chat<UIMessage> | null>(null);
  // Live run-context (current model/provider/mode) the transport backfills onto
  // body-less sends — the question/tool auto-resubmit — so a resume keeps the
  // session's model + posture instead of resetting them. Assigned below once the
  // pickers resolve; read fresh per send via the getter.
  const runContextRef = useRef<Partial<Omit<AgentRunOptions, "messages">>>({});
  const chat = useMemo(
    () =>
      new Chat<UIMessage>({
        id: chatSession.current_id ?? undefined,
        messages: chatSession.initial_messages,
        transport: desktopAgentTransport.create({
          workspace_id: workspace.id,
          session_id: chatSession.current_id ?? undefined,
          runContext: () => runContextRef.current,
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
        // Resume after a CLIENT-resolved tool result lands. fs/todos/command are
        // server-resolved (the sidecar completes the loop in-stream, ending on
        // text — never a dangling tool call), so this fires for the human-input
        // tools answered via their pinned cards: `question` and `design_search`
        // (the pick card). Once the result lands the message becomes
        // complete-with-tool-calls and the paused run resumes. Approval pauses
        // are NOT affected (an approval-requested call has no result).
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      }),
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
  // Sync the ref to the ACTUAL `chat` React committed (StrictMode-safe — the
  // memo factory is pure, so the ref assignment lives here in a post-commit
  // effect that always sees the kept instance, never a discarded double).
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);
  // Reconnect to an in-flight run on remount/refresh via `useResumeInFlight`
  // (NOT the SDK's `resume: true`). `resume: true` resumes once on mount,
  // against the placeholder chat that has no session id yet — the id is
  // restored async from localStorage, so the rebuilt chat that carries it
  // never resumes and a refresh silently shows a stale DB snapshot. The hook
  // resumes once per chat instance that has a real session id, never over a
  // turn this client is streaming itself. Transport returns null on the agent
  // sidecar's 404 → clean no-op; on success it replays the chunk log and
  // live-tails. See `bridge-transport.ts` + `agent/stream-registry.ts`.
  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    clearError,
    setMessages,
    resumeStream,
  } = useChat({ chat });

  // GRIDA-SEC-006 — a mid-run `gg_token_expired` means the pushed
  // session lapsed during a long turn: re-mint in the background so the
  // retry (or the next send) rides a fresh token.
  useEffect(() => {
    if (error && gridaGateway.isGgTokenExpired(error)) {
      void gridaGateway.forceRefresh();
    }
  }, [error]);
  // `isStreaming` = a turn is actively streaming THROUGH THIS CLIENT. Used
  // where that is the honest concept: the typing indicator, the Stop/Send
  // button, and "did I start this turn?" (vs. the core). It is the AI-SDK
  // client's optimistic per-request status — NOT the authoritative session
  // state.
  const isStreaming = status === "submitted" || status === "streaming";

  // Reconnect to the session's in-flight run after a remount/refresh. Keyed on
  // the chat instance + session id so the resume tracks the chat the async
  // localStorage restore rebuilds — the gap `resume: true` left open.
  useResumeInFlight({
    chat,
    sessionId: chatSession.current_id,
    isStreaming,
    resumeStream,
  });

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

  // Configured endpoint providers (issue #806): their registered models
  // join the picker and the capability gates below.
  const endpoints = useEndpointProviders();

  // Flat model selection (ignores tiers). Seeds from the welcome
  // composer's pick on a handed-off fresh session, otherwise from the
  // active session's stored model, and rides each send as `body.modelId`.
  const { model_id: modelId, setModelId } = useModelPickerState({
    current_id: chatSession.current_id,
    sessions: chatSession.sessions,
    initial: handoff?.model_id,
    endpoints,
  });

  // Permission/supervision posture (RFC `permission modes`). Seeds from the
  // active session's stored mode; rides each send as `body.mode`.
  const { mode, setMode } = useModePickerState({
    current_id: chatSession.current_id,
    sessions: chatSession.sessions,
  });

  // Whether the active model accepts image input — memoized so the
  // registry lookup doesn't re-scan on every render (only when the model
  // or endpoint list changes).
  const multimodal = useMemo(
    () => registered_models.resolve(modelId, endpoints)?.multimodal ?? false,
    [modelId, endpoints]
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
  // the optimistic mirror, shared with `ai-sidebar/chat.tsx`.
  // Endpoint provider pin for the active model (issue #806) — rides every
  // run-entering body: normal sends AND approval resumes below.
  const providerId = registered_models.providerIdForModel(modelId, endpoints);
  // Keep the transport's body-less backfill (above) in step with the pickers.
  // (Skills are no longer per-tab: the agent discovers them from disk and
  // advertises them itself, loading on demand via the `skill` tool.)
  runContextRef.current = {
    model_id: modelId,
    mode,
    ...(providerId ? { provider_id: providerId } : {}),
  };

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
      providerId,
      mode,
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
  // session adopts its id — can't re-fire it. An EMPTY prompt (the home's
  // blank / references-only start) is still consumed — cleared without
  // sending — otherwise the stale handoff would force a fresh session on
  // every later mount of this workspace.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (handoffPrompt == null || autoSentRef.current || chatSession.loading) {
      return;
    }
    autoSentRef.current = true;
    welcome_handoff.clear(workspace.id);
    if (handoffPrompt) void onSubmit(handoffPrompt);
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

  // Answer a pending tool approval (RFC `permission modes`, Phase 2). The
  // Allow/Deny rides the run-request body as an explicit `approval_answer` field
  // — exactly how `mode`/`model_id` travel. The sidecar owns message state (it
  // rebuilds the model view from the DB each turn), validates the answer against
  // the persisted pending approval, and resumes; because the resume stream
  // re-advertises the original assistant message id, the AI-SDK reducer merges
  // the resume into that message in place. So the desktop is a THIN sender — no
  // message mutation, no DB reconcile, no SDK client-state approval helpers. The
  // body shape is pinned headless in `approval-resume.test.ts`.
  const onApprove = useCallback(
    (pending: PendingApproval, approved: boolean) => {
      // Send through `chat` directly (the instance `useChat` renders), NOT
      // `chatRef.current` — the ref is a post-commit mirror, while `chat` is the
      // live populated instance holding `[user, A]`. Resuming through the right
      // instance is what lets the AI-SDK reducer merge the resume's tool-output
      // into the existing `run_command` part instead of failing to find it.
      return chat.sendMessage(undefined, {
        body: buildApprovalResumeBody({
          session_id: chatSession.current_id ?? undefined,
          model_id: modelId,
          provider_id: providerId,
          mode,
          tool_call_id: pending.toolCallId,
          approval_id: pending.approvalId,
          approved,
        }),
      });
    },
    [chat, chatSession.current_id, modelId, providerId, mode]
  );

  // A pending supervised approval (the model called a mutating command in
  // Accept Edits and the sidecar paused it). Surfaced as a session-global bar
  // above the composer so the Allow/Deny is instantly visible — not buried in a
  // collapsed tool row. Read off the last assistant turn's tool parts.
  const pendingApproval = useMemo(
    () => findPendingApproval(messages),
    [messages]
  );

  // Commit a `question` (ask-user) answer: the human's answer becomes the tool
  // result and `sendAutomaticallyWhen` resumes the paused run. Unlike the
  // approval resume (which must use the live `chat` to merge into an in-flight
  // message), this fires on a click against an already-settled card, so the
  // post-commit `chatRef` mirror is the right (stable) instance.
  // Commit the user's design_search picks (the visual brief): the picks become
  // the tool result and `sendAutomaticallyWhen` resumes the paused run, now
  // conditioned on the picked references. Same stable-instance reasoning as
  // `onAnswerQuestion`.
  const onPickReferences = useCallback<PickReferencesHandler>(
    (toolCallId, output) => {
      void chatRef.current?.addToolResult({
        tool: "design_search",
        toolCallId,
        output,
      });
    },
    []
  );

  const onAnswerQuestion = useCallback<AnswerQuestionHandler>(
    (toolCallId, output) => {
      void chatRef.current?.addToolResult({
        tool: "question",
        toolCallId,
        output,
      });
    },
    []
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

  // The agent ASKS: a pending `question` is a session-global prompt pinned above
  // the composer (same model as the approval bar), not a transcript card.
  // Memoized on `messages` to match `pendingApproval` above.
  const pendingQuestion = useMemo(
    () => findPendingQuestion(messages),
    [messages]
  );

  // A pending `design_search` pauses the run on the user's selection. The pick
  // surface itself is hosted by the editor pane (a dedicated virtual tab, room
  // to browse a large staggered gallery), so we lift the live session up to the
  // workbench rather than render the picker here.
  const pendingPick = useMemo(
    () => findPendingDesignSearch(messages),
    [messages]
  );

  useEffect(() => {
    onDesignSearchChange?.(
      pendingPick
        ? { entry: pendingPick, onPick: onPickReferences, busy }
        : null
    );
  }, [pendingPick, busy, onPickReferences, onDesignSearchChange]);

  // Clear the lifted session if this pane unmounts mid-pick (closes the tab).
  useEffect(() => {
    return () => onDesignSearchChange?.(null);
  }, [onDesignSearchChange]);

  // Pre-first-token "Thinking" indicator: a turn is streaming through this
  // client, but the AI-SDK reducer hasn't created the assistant message yet (it
  // does so on the first content chunk), so the per-bubble shimmer has nothing
  // to mount on. Bridge that dead-air window with a tail indicator until an
  // assistant turn begins.
  const pendingTurn = isStreaming && messages.at(-1)?.role !== "assistant";

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
          {pendingTurn && <PendingTurnIndicator />}
          {compacting && <CompactingIndicator />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {justForked && <ForkedNotice />}

      {error && (
        <div className="flex items-start gap-2 border-t bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {/* GRIDA-SEC-006 — the two hosted-AI codes cross the bridge as
              bare code-led messages; translate to actionable copy. A
              token-expired error also fires a background re-mint so the
              user's next send just works. */}
          <span className="flex-1">
            {gridaGateway.isGgTokenExpired(error)
              ? "Your Grida session needed a refresh — try sending again."
              : gridaGateway.isGgInsufficientCredits(error)
                ? "Your organization is out of AI credits."
                : error.message}
          </span>
          {gridaGateway.isGgInsufficientCredits(error) && (
            <button
              type="button"
              onClick={() => void openManageBilling()}
              className="underline"
            >
              add credits
            </button>
          )}
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

      <ModelToolCallNotice model_id={modelId} endpoints={endpoints} />

      {/* Hidden while the session is busy: clicking Allow/Deny starts the
          resume turn (busy → true), so the bar vanishes on click — instant
          feedback, no optimistic message mutation needed. */}
      {pendingApproval && !busy && (
        <AgentApprovalBar pending={pendingApproval} onApprove={onApprove} />
      )}

      {/* The agent is asking — session-global prompt above the composer. */}
      {pendingQuestion && (
        <div className="shrink-0 border-t p-3">
          <QuestionCard
            entry={pendingQuestion}
            onAnswer={onAnswerQuestion}
            disabled={busy}
          />
        </div>
      )}

      {/* The agent gathered references — the picker opens in the editor pane as
          a dedicated tab. This note keeps the request visible here and reopens
          the tab if the user closed it. */}
      {pendingPick && (
        <div className="shrink-0 border-t p-3">
          <button
            type="button"
            onClick={() => onOpenPicker?.()}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground shadow-sm transition hover:border-foreground/20 hover:text-foreground"
          >
            <ImagesIcon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Pick references
              {pickQuery(pendingPick)
                ? ` for “${pickQuery(pendingPick)}”`
                : ""}{" "}
              — open the picker
            </span>
          </button>
        </div>
      )}

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
              <DesktopModePicker value={mode} onValueChange={setMode} />
              <DesktopModelPicker
                value={modelId}
                onValueChange={setModelId}
                endpoints={endpoints}
              />
              <DesktopContextMeter
                messages={messages}
                modelId={modelId}
                costUsd={activeSession?.cost_usd}
                endpoints={endpoints}
              />
            </>
          }
        />
      </div>
    </div>
  );
}

/** A supervised command awaiting the user's Allow/Deny (RFC `permission
 *  modes`, Phase 2). `approvalId` is the tool part's `approval.id`;
 *  `toolCallId` identifies the paused call — both ride the answer back so the
 *  sidecar can match it to the persisted pending approval. */
type PendingApproval = {
  approvalId: string;
  toolCallId: string;
  /** Human label for the command, e.g. `python3 quadtree.py`. */
  label: string;
  description?: string;
};

/**
 * Find a pending supervised approval on the LAST assistant turn. The sidecar
 * pauses a mutating command in Accept Edits and emits an `approval-requested`
 * tool part; this surfaces it for the session-global bar. Tolerant of both the
 * live (camelCase `toolCallId`) and hydrated (snake `tool_call_id`) part shapes
 * — it only reads `state`/`approval`/`input`, which agree in both.
 */
function findPendingApproval(messages: UIMessage[]): PendingApproval | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return null;
  for (const part of last.parts) {
    const p = part as {
      type?: string;
      state?: string;
      toolCallId?: string;
      tool_call_id?: string;
      approval?: { id?: string };
      input?: { command?: string; args?: string[]; description?: string };
    };
    const toolCallId = p.toolCallId ?? p.tool_call_id;
    if (
      typeof p.type !== "string" ||
      (!p.type.startsWith("tool-") && p.type !== "dynamic-tool") ||
      p.state !== "approval-requested" ||
      !p.approval?.id ||
      !toolCallId
    ) {
      continue;
    }
    const input = p.input ?? {};
    const label = input.command
      ? `${input.command} ${(input.args ?? []).join(" ")}`.trim()
      : p.type.replace(/^tool-/, "");
    return {
      approvalId: p.approval.id,
      toolCallId,
      label,
      description: input.description,
    };
  }
  return null;
}

/**
 * Session-global supervised-approval prompt, rendered above the composer so the
 * Allow/Deny is instantly visible (not buried in a collapsed tool row).
 */
function AgentApprovalBar({
  pending,
  onApprove,
}: {
  pending: PendingApproval;
  onApprove: (
    pending: PendingApproval,
    approved: boolean
  ) => void | Promise<void>;
}) {
  return (
    <div className="shrink-0 border-t bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {pending.description
              ? pending.description
              : "This command mutates files or executes code."}{" "}
            Allow it to run?
          </p>
          <code className="mt-1 block truncate font-mono text-xs text-foreground/80">
            $ {pending.label}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onApprove(pending, false)}
          >
            Deny
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void onApprove(pending, true)}
          >
            Allow
          </Button>
        </div>
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

/**
 * GRIDA-SEC-006 — "add credits" delegation: resolve the org's billing
 * path from the same-origin summary route and open it in the OS browser
 * (the Part-2a Manage-billing pattern; the webview never navigates).
 */
async function openManageBilling(): Promise<void> {
  try {
    const res = await fetch("/desktop/billing/summary");
    const summary = (await res.json()) as { manage_path?: string };
    const path = summary.manage_path ?? "/";
    const bridge = getDesktopBridge();
    if (!bridge) return;
    await bridge.shell.open_external(
      new URL(path, window.location.origin).toString()
    );
  } catch {
    // Best-effort affordance; the settings Credits card is the fallback.
  }
}
