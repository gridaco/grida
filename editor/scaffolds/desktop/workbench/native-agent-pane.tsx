"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  DesktopNativeChat,
  NativeChatMessage,
  NativeChatReadiness,
} from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { readLibraryAttachment } from "@/app/(library)/library/attachment";
import { encodeLibraryPng } from "@/lib/agent-chat/image-attachment";
import { PlayIcon, SquareIcon, GoalIcon, XIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@app/ui/ai-elements/conversation";
import {
  ChatMessageView,
  CompactionNotice,
  PendingTurnIndicator,
  QuestionPrompt,
  workspace_links,
} from "@/kits/agent-chat";
import {
  NativeChatController,
  type NativeChatEditorSurfaces,
  type NativeChatView,
  type NativeChatInitialComposer,
} from "@/lib/agent-chat/native-chat-controller";
import { subscribeToNativeNotificationFocus } from "@/lib/desktop/agent-focus-session";
import {
  ComposerDropArea,
  type ComposerCatalog,
  type ComposerController,
  type ComposerTransfer,
} from "@/kits/composer";
import { AgentApprovalPrompt } from "../shared/agent-approval";
import { AgentLibraryAttachmentPicker } from "../shared/agent-library-attachment-picker";
import { AgentPermissionConfirmation } from "../shared/agent-permission-confirmation";
import { AgentComposer } from "../shared/agent-composer";
import { useWorkspaceFileMentions } from "../shared/use-workspace-file-mentions";
import { NativeComposerTray } from "./native-composer-tray";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { ContextMeter } from "../shared/context-meter";
import { computeContextUsage } from "@/lib/agent-chat/context-usage";
import { cn } from "@app/ui/lib/utils";
import styles from "./agent-pane.module.css";
import {
  SideChatPlacement,
  type SideChatPresentation,
} from "./side-chat-placement";
import { NativeTurnArtifacts } from "./native-turn-summary";
import { NativeAttachmentCard } from "./native-attachment-card";
import { NativeEarlierMessages } from "./native-earlier-messages";
import { NativeTurnActivity } from "./native-turn-activity";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { native_message_parts } from "@/lib/agent-chat/native-message-parts";
import { NativeMessageRevisionPanel } from "./native-message-revision-panel";
import { NativeSubagentActivityPanel } from "./native-agent-activity";
import { SubagentPlacement } from "./subagent-placement";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";

import { NativeChatHeader } from "./native-chat-controls";

const NO_COMMANDS: ComposerCatalog["commands"] = [];
const MAX_DRAFT_BYTES = 512 * 1024;
const readNoActivity = () => null;
const subscribeNoActivity = () => () => {};
const APPROVAL_ACTION = {
  read_file: "Read file",
  list_files: "List folder",
  search_text: "Search files",
  write_file: "Replace file",
  edit_file: "Edit file",
} as const;
const selectionMemory = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};

/** One store per window, so a draft outlives any composer instance. */
const COMPOSER_DRAFTS = new ComposerDrafts();

/**
 * A first message chosen before the workspace opened, with its connection.
 * `take` hands the text over once (see `welcome-message.ts`); `waiting`
 * tells whether it is still there to take.
 */
export type NativeFirstMessage = Readonly<{
  profileId: string | null;
  composer?: NativeChatInitialComposer;
  waiting: () => boolean;
  take: () => string | null;
}>;

type NativeChatPresentation = {
  subagentPlacement?: SubagentPlacement;
  /** Lends the selected main chat's existing controller to its workspace. */
  onProcessesChange?: (
    processes: NativeBackgroundProcessController | null
  ) => void;
};

export function NativeAgentPaneGate({
  bridge,
  selectionKey,
  workspaceId,
  initialSession,
  editorSurfaces,
  sideChatPlacement,
  firstMessage,
  onProcessesChange,
  subagentPlacement,
}: {
  bridge: DesktopNativeChat;
  selectionKey?: string;
  workspaceId?: string;
  initialSession: string | null;
  editorSurfaces?: NativeChatEditorSurfaces;
  /** Where this chat's side chats are shown. */
  sideChatPlacement: SideChatPlacement;
  /** Sent once as a new chat's first turn when the chat is ready. */
  firstMessage?: NativeFirstMessage;
} & NativeChatPresentation) {
  const [attempt, setAttempt] = useState(0);
  const [messageDropped, setMessageDropped] = useState(false);
  const [selection, setSelection] = useState<{
    bridge: DesktopNativeChat;
    attempt: number;
    readiness: NativeChatReadiness | null;
    recommendedProfileId?: string;
  }>();
  useEffect(() => {
    // A first message starts on the connection chosen with it, not on the
    // workspace's remembered model.
    const message = firstMessage?.waiting() ? firstMessage : undefined;
    const remembered = message
      ? message.profileId
      : NativeChatController.rememberedProfile(
          selectionMemory,
          selectionKey && `grida.nativeChat.${selectionKey}`
        );
    return NativeChatController.watchReadiness(
      bridge,
      (readiness, recommendedProfileId) =>
        setSelection({ bridge, attempt, readiness, recommendedProfileId }),
      remembered ? { kind: message ? "new" : "saved", id: remembered } : null,
      message
        ? undefined
        : {
            memory: selectionMemory,
            key: selectionKey && `grida.nativeChat.${selectionKey}`,
            initialSession,
          }
    );
  }, [bridge, attempt, selectionKey, firstMessage, initialSession]);
  const readiness =
    selection?.bridge === bridge && selection.attempt === attempt
      ? selection.readiness
      : undefined;
  // While the agent starts, the ordinary pane is shown; it connects and
  // accepts sends once startup finishes.
  const starting = readiness === undefined || readiness === "native-starting";
  // Without a usable default connection the pane still opens; its composer
  // asks for a model, and choosing one continues in the same pane.
  const connectionRequired =
    !starting &&
    readiness !== "native-ready" &&
    readiness !== null &&
    readiness !== "native-unavailable" &&
    readiness !== "native-workspace-capacity" &&
    !!workspaceId &&
    !!bridge.profiles &&
    !!bridge.selectProfile;
  const unavailable =
    !starting && readiness !== "native-ready" && !connectionRequired;
  // Chat cannot open here, so the message is dropped with a notice instead
  // of waiting to be sent whenever this workspace opens again.
  useEffect(() => {
    if (unavailable && firstMessage?.take()) setMessageDropped(true);
  }, [unavailable, firstMessage]);
  if (unavailable)
    return (
      <div className="flex flex-col gap-2 px-3 py-2 text-xs">
        <span role="alert" className="text-destructive">
          {readiness === null
            ? "Couldn't check chat availability."
            : (nativeChatConnectionNote[readiness] ??
              "Native chat is unavailable.")}
          {messageDropped && " Your message from Welcome wasn't sent."}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setAttempt((current) => current + 1)}
        >
          Retry
        </Button>
      </div>
    );
  return (
    <NativeAgentPane
      key={initialSession}
      bridge={bridge}
      starting={starting}
      connectionRequired={connectionRequired}
      connectionNote={
        connectionRequired && readiness
          ? nativeChatConnectionNote[readiness]
          : undefined
      }
      selectionKey={selectionKey}
      workspaceId={workspaceId}
      initialSession={initialSession}
      startupProfileId={
        readiness === "native-ready"
          ? selection?.recommendedProfileId
          : undefined
      }
      editorSurfaces={editorSurfaces}
      sideChatPlacement={sideChatPlacement}
      firstMessage={firstMessage}
      onProcessesChange={onProcessesChange}
      subagentPlacement={subagentPlacement}
    />
  );
}

/** Shown only when the person must act outside the chat before choosing. */
const nativeChatConnectionNote: Partial<Record<NativeChatReadiness, string>> = {
  "native-hooks-review-required":
    "A configured hook needs review before chat can start. Open Settings → Hooks to review it, or disable it in config.toml.",
  "native-hooks-configuration-invalid":
    "The global hook configuration couldn't be loaded. Open Settings → Hooks to inspect and fix it, then retry.",
  "native-provider-key-required":
    "Add an API key for the selected provider in Desktop settings, or choose another model.",
  "native-provider-model-unavailable":
    "The selected model is unavailable. Choose another model.",
  "native-provider-endpoint-https-required":
    "Native chat requires HTTPS for an endpoint on another device. Update the saved endpoint in Desktop settings, or choose another model.",
  "native-provider-endpoint-approval-required":
    "Save the selected endpoint in Desktop settings and approve its address, or choose another model.",
  "native-workspace-capacity":
    "Chat is already running in as many projects as Desktop keeps open at once. Quit and reopen Grida Desktop, then retry.",
};

export function NativeAgentPane({
  bridge,
  starting = false,
  connectionRequired = false,
  connectionNote,
  selectionKey,
  workspaceId,
  initialSession,
  startupProfileId,
  editorSurfaces,
  sideChatPlacement,
  firstMessage,
  onProcessesChange,
  subagentPlacement,
}: {
  bridge: DesktopNativeChat;
  /** The agent is still starting; the pane shows but does not connect yet. */
  starting?: boolean;
  /** No connection can run yet; the composer's model picker starts the chat. */
  connectionRequired?: boolean;
  connectionNote?: string;
  selectionKey?: string;
  workspaceId?: string;
  initialSession: string | null;
  /** An untouched chat's recommended connection, selected before startup. */
  startupProfileId?: string;
  editorSurfaces?: NativeChatEditorSurfaces;
  /** Where this chat's side chats are shown; see `side-chat-placement.ts`. */
  sideChatPlacement: SideChatPlacement;
  /** Sent once as a new chat's first turn; see {@link NativeAgentPaneGate}. */
  firstMessage?: NativeFirstMessage;
} & NativeChatPresentation) {
  const controller = useMemo(() => {
    const created = new NativeChatController(
      bridge,
      selectionMemory,
      selectionKey && `grida.nativeChat.${selectionKey}`,
      editorSurfaces,
      !!workspaceId
    );
    created.keepDrafts(COMPOSER_DRAFTS, workspaceId ?? "standalone");
    return created;
  }, [bridge, selectionKey, editorSurfaces, workspaceId]);
  useEffect(() => {
    const publish = () =>
      onProcessesChange?.(
        starting || connectionRequired
          ? null
          : controller.read().backgroundProcesses
      );
    publish();
    const unsubscribe = controller.subscribe(publish);
    return () => {
      unsubscribe();
      onProcessesChange?.(null);
    };
  }, [controller, onProcessesChange, starting, connectionRequired]);
  const draft = useRef<NativeChatComposer>(null);
  // Side chats show wherever the host places them.
  useEffect(
    () =>
      SideChatPlacement.connect(controller, sideChatPlacement, {
        bridge,
        workspaceId,
        editorSurfaces,
      }),
    [controller, sideChatPlacement, bridge, workspaceId, editorSurfaces]
  );
  useEffect(() => {
    const profile =
      workspaceId && initialSession
        ? new URLSearchParams(window.location.hash.slice(1)).get("chat-profile")
        : null;
    if (starting) return;
    // A message that could not be sent stays with this effect's chat. The
    // controller retains late failures in their original draft before returning.
    let active = true;
    const keep = (text: string | null) => {
      if (active && text) draft.current?.appendText(text, MAX_DRAFT_BYTES);
    };
    const message = firstMessage?.waiting() ? firstMessage : undefined;
    if (message && !initialSession)
      void controller
        .startChat(message.profileId, message.take, message.composer)
        .then(keep);
    else if (connectionRequired) controller.connectForSelection();
    else controller.connect(initialSession, profile ?? startupProfileId);
    const stopFocus =
      workspaceId &&
      subscribeToNativeNotificationFocus(
        bridge,
        workspaceId,
        (sessionId, profileId) =>
          void controller.focusChat(sessionId, profileId)
      );
    return () => {
      active = false;
      if (stopFocus) stopFocus();
      controller.disconnect();
    };
  }, [
    bridge,
    controller,
    initialSession,
    startupProfileId,
    firstMessage,
    workspaceId,
    connectionRequired,
    starting,
  ]);
  useEffect(() => {
    if (!subagentPlacement || starting || connectionRequired) return;
    return SubagentPlacement.connect(controller, subagentPlacement);
  }, [controller, subagentPlacement, starting, connectionRequired]);
  return (
    <NativeChatPane
      controller={controller}
      bridge={bridge}
      workspaceId={workspaceId}
      editorSurfaces={editorSurfaces}
      connectionRequired={connectionRequired}
      connectionNote={connectionNote}
      draftRef={draft}
      subagentsInTabs={!!subagentPlacement}
      header={(state) => (
        <NativeChatHeader controller={controller} state={state} />
      )}
    />
  );
}

/** The composer handle a chat pane lends its owner. */
type NativeChatComposer = Pick<ComposerController, "appendText" | "focus">;

/**
 * A side chat, as a placement presents it: the ordinary chat pane bound to
 * the side session, under a header with its title that closes it. It fills
 * the container it is placed in; see `side-chat-placement.ts`.
 */
export function NativeSideChatPane({
  presentation,
}: {
  presentation: SideChatPresentation;
}) {
  const { chat, focus, host, close } = presentation;
  const draft = useRef<NativeChatComposer>(null);
  // Each request to show the side chat puts the caret in its composer.
  useEffect(() => {
    draft.current?.focus();
  }, [focus]);
  return (
    <NativeChatPane
      controller={chat}
      bridge={host.bridge}
      workspaceId={host.workspaceId}
      editorSurfaces={host.editorSurfaces}
      draftRef={draft}
      autofocus
      testId="native-side-chat"
      header={() => (
        <header className="flex h-10 shrink-0 items-center gap-2 px-3 text-xs font-medium">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {chat.sideChatTitle()}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Close side chat"
            title="Close side chat"
            onClick={close}
          >
            <XIcon className="size-3.5" />
          </Button>
        </header>
      )}
    />
  );
}

/**
 * One chat's conversation, prompts and composer, for whatever chat
 * `controller` is bound to. A chat bound to a fixed session (a side chat)
 * offers only what it can do: no other model, and only the commands and
 * modes its snapshot does not refuse. Choosing among chats belongs to
 * `header`.
 */
function NativeChatPane({
  controller,
  bridge,
  workspaceId,
  editorSurfaces,
  connectionRequired = false,
  connectionNote,
  draftRef: draft,
  header,
  autofocus,
  testId = "workspace-native-chat",
  subagentsInTabs = false,
}: {
  controller: NativeChatController;
  bridge: DesktopNativeChat;
  workspaceId?: string;
  editorSurfaces?: NativeChatEditorSurfaces;
  /** No connection can run yet; the composer's model picker starts the chat. */
  connectionRequired?: boolean;
  connectionNote?: string;
  draftRef: RefObject<NativeChatComposer | null>;
  header: (state: NativeChatView) => ReactNode;
  autofocus?: boolean;
  testId?: string;
  subagentsInTabs?: boolean;
}) {
  // Workspace file links in replies open in the workbench, which validates
  // the path against the workspace before opening a tab.
  const openWorkspaceLink = useMemo(() => {
    const open = editorSurfaces?.open;
    return open
      ? (path: string) => {
          const target = workspace_links.workspacePath(path);
          if (target)
            void open.call(editorSurfaces, target, () => true).catch(() => {});
        }
      : null;
  }, [editorSurfaces]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const subagentActivity = useSyncExternalStore(
    state.subagents?.subscribe ?? subscribeNoActivity,
    state.subagents?.read ?? readNoActivity,
    state.subagents?.read ?? readNoActivity
  );
  useEffect(() => {
    const refresh = () => void controller.readProfiles();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [controller]);
  // One preview per staged draft; a new draft object means a new attachment.
  const attachmentPreview = useMemo(
    () => (state.attachmentDraft ? controller.attachmentPreview() : null),
    [controller, state.attachmentDraft]
  );
  const mentions = useWorkspaceFileMentions(workspaceId);
  const catalog = useMemo(
    () => ({ commands: NO_COMMANDS, mentions }),
    [mentions]
  );
  const pngPicker = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const [libraryScope, setLibraryScope] = useState<number | null>(null);
  const activityOpen = !subagentsInTabs && !!subagentActivity?.open;
  const [libraryRequest, setLibraryRequest] = useState<{
    scope: number;
    selectionId: string;
  } | null>(null);
  const snapshot = state.observation?.snapshot;
  const editHistory = controller.canReviseHistory && !state.revisionDraft;
  const turn = snapshot?.current;
  const running =
    turn?.disposition === "running" && !turn.paused && !turn.cancelled;
  const canResume = controller.hasPausedTurn;
  const goalTurn =
    !!turn && state.goal?.goal?.reservation?.turnId === turn.turnId;
  // A paused turn resumes from the composer; a Goal's own pause resumes from
  // its strip.
  const resumable = canResume && !(goalTurn && state.goal?.goal?.paused);
  // Show Resume as soon as Pause is chosen; it waits for the pause to settle.
  const pausing =
    !!turn && !turn.cancelled && (state.pausing === turn.turnId || turn.paused);
  const approval =
    turn?.disposition === "suspended" && !turn.paused && !turn.cancelled
      ? state.approvals[0]
      : undefined;
  const question = turn && !turn.cancelled ? state.questions[0] : undefined;
  const librarySelection = state.librarySelection;
  const retrying =
    running && !question && snapshot?.retryNotBeforeMs !== undefined;
  const queued = snapshot?.queuedInputs ?? 0;
  const streamingControlsOnly = running && !bridge.enqueue;
  const error = state.error ?? state.approvalError ?? state.questionError;

  const selectedProfile =
    state.profiles?.saved.find((p) => p.id === state.profiles?.active) ??
    state.profiles?.choices.find((p) => p.id === state.profiles?.active);
  const contextWindow =
    selectedProfile?.contextWindow ??
    (state.profiles?.active === null
      ? state.profiles.defaultContextWindow
      : undefined);
  const measuredContext = turn_activity.measuredContext(state.turnRecords);
  const contextUsage = computeContextUsage(
    state.messages.map((message) => ({
      role: message.role,
      parts: [{ type: "text", text: message.text }],
    })),
    contextWindow,
    measuredContext
  );
  const blocks = turn_activity.group(
    state.messages,
    state.turnRecords,
    snapshot?.current,
    snapshot?.latest
  );
  const records = new Map<string, (typeof state.turnRecords)[number]>();
  for (const record of state.turnRecords)
    if (!records.has(record.turnId)) records.set(record.turnId, record);
  // A turn's actions sit under its final answer only, once it settles.
  const finalAnswer = new Map<string, string>();
  // The first user message of a goal-start turn is the one that set it.
  const firstRequest = new Map<string, string>();
  for (const message of state.messages)
    if (message.role === "assistant" && message.turnId)
      finalAnswer.set(message.turnId, message.messageId);
    else if (
      message.role === "user" &&
      message.turnId &&
      !firstRequest.has(message.turnId)
    )
      firstRequest.set(message.turnId, message.messageId);
  const renderMessage = (message: NativeChatMessage) => {
    const record = message.turnId ? records.get(message.turnId) : undefined;
    const goalStart =
      record?.goalStart &&
      !!message.turnId &&
      firstRequest.get(message.turnId) === message.messageId;
    return (
      <ChatMessageView
        key={message.messageId}
        loadAttachmentPreview={controller.readAttachmentPreview}
        actions={
          message.role === "user"
            ? {
                // Only plain-text requests can be edited; a request with an
                // attachment or one that started a goal cannot be resubmitted.
                ...(editHistory &&
                  !message.attachments?.length &&
                  !goalStart && {
                    onEdit: (messageId: string) =>
                      void controller.prepareRevision(messageId),
                  }),
                sentAtMs: record?.startedAtMs,
                note: goalStart ? (
                  <>
                    <GoalIcon />
                    Sent as goal
                  </>
                ) : undefined,
              }
            : message.turnId &&
                (finalAnswer.get(message.turnId) !== message.messageId ||
                  (record && record.settledAtMs === undefined))
              ? { hidden: true }
              : record?.settledAtMs !== undefined
                ? { sentAtMs: record.settledAtMs }
                : undefined
        }
        message={{
          id: message.messageId,
          role: message.role,
          parts: native_message_parts.of(message),
        }}
      />
    );
  };

  // A drop anywhere in the pane takes the same intake as one on the composer
  // editor; the composer consumes its own drops first, so each is handled once.
  // (see test/desktop-agent-chat-pane-drop.md)
  const transferAttachment = ({ resources }: ComposerTransfer.Event) => {
    if (!activityOpen)
      void controller.pickTransferredAttachment(state.scope, resources);
  };

  return (
    <ComposerDropArea
      data-testid={testId}
      className="relative flex min-h-0 flex-1 flex-col"
      onTransfer={transferAttachment}
    >
      <AgentPermissionConfirmation
        review={state.permissionModeReview}
        onAnswer={(confirmed) =>
          controller.answerPermissionModeReview(confirmed)
        }
      />
      <div inert={activityOpen} className="flex min-h-0 flex-1 flex-col">
        <div className="min-w-0 shrink-0">{header(state)}</div>
        {(state.profileError ||
          state.catalogEntryError ||
          state.permissionModeError) && (
          <p role="alert" className="px-3 py-1 text-xs text-destructive">
            {state.profileError ??
              state.catalogEntryError ??
              state.permissionModeError}
          </p>
        )}
        {connectionRequired && !state.scope && (
          <div className="text-muted-foreground px-3 py-1 text-xs">
            {connectionNote && <p>{connectionNote}</p>}
            {state.profiles &&
              state.profiles.choices.length + state.profiles.saved.length ===
                0 && (
                <p>
                  Add a provider in Desktop settings, then return here to choose
                  a model.
                </p>
              )}
          </div>
        )}
        <workspace_links.Opener.Provider value={openWorkspaceLink}>
          <Conversation
            className="min-h-0 flex-1"
            initial="instant"
            resize={running ? "smooth" : "instant"}
          >
            <ConversationContent
              className="gap-4 px-3 py-4"
              scrollClassName={cn(
                styles.chatScroll,
                "desktop-native-drag-scroll-viewport scroll-fade-y scroll-fade-4"
              )}
            >
              <NativeEarlierMessages
                canLoad={state.canReadEarlier}
                loading={state.readingEarlier}
                error={state.earlierError}
                count={state.messages.length}
                onLoad={() => void controller.loadEarlierMessages()}
              />
              {/* See test/desktop-agent-chat-turn-activity.md. */}
              {blocks.map((block) =>
                block.kind === "turn" ? (
                  <NativeTurnActivity
                    key={block.turnId}
                    block={block}
                    renderMessage={renderMessage}
                    subagentEvents={subagentActivity?.events.filter(
                      (event) => event.parentTurnId === block.turnId
                    )}
                    onOpenSubagent={(childId, inputId) =>
                      void state.subagents?.openChild(childId, inputId)
                    }
                  />
                ) : block.kind === "compaction" ? (
                  <CompactionNotice
                    key={block.turnId}
                    summary={block.summary}
                    auto={block.automatic}
                  />
                ) : (
                  renderMessage(block.message)
                )
              )}
              {subagentActivity?.activityAvailable &&
                !subagentActivity.eventsComplete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="self-start text-muted-foreground"
                    onClick={() => state.subagents?.show()}
                  >
                    More subagent activity is available in Subagents
                  </Button>
                )}
              {running &&
                !retrying &&
                state.messages.at(-1)?.role !== "assistant" && (
                  <PendingTurnIndicator />
                )}
              {/* See test/desktop-agent-chat-transcript-history.md. */}
              {!turn &&
                !state.loading &&
                !state.repairing &&
                state.turnSummary &&
                state.turnSummary.turnId === snapshot?.latest?.turnId &&
                bridge.readArtifact && (
                  <NativeTurnArtifacts
                    key={state.turnSummary.turnId}
                    summary={state.turnSummary}
                    controller={controller}
                  />
                )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </workspace_links.Opener.Provider>
        {state.revisionDraft ? (
          <NativeMessageRevisionPanel
            draft={state.revisionDraft}
            submitting={state.revisionSubmitting}
            effortAvailable={state.effortAvailable}
            onChange={(text) => controller.changeRevisionText(text)}
            onCancel={() => controller.cancelRevision()}
            onSubmit={() => void controller.submitRevision()}
          />
        ) : state.revisionSubmitting ? (
          <div
            role="status"
            className="px-3 pt-2 text-xs text-muted-foreground"
          >
            Opening edit…
          </div>
        ) : null}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 px-3 pt-2 text-xs text-destructive"
          >
            <span className="flex-1">{error}</span>
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
        {approval && (
          <AgentApprovalPrompt
            description={
              approval.tool === "write_file" || approval.tool === "edit_file"
                ? "The agent is asking to change its settings file."
                : "The agent is asking for additional read access."
            }
            detail={
              <div className="mt-1 max-h-24 overflow-y-auto break-all font-mono text-xs text-foreground/80">
                <div>
                  {APPROVAL_ACTION[approval.tool]}{" "}
                  {reviewText(approval.relativePath || ".")}
                </div>
                <div>Folder {reviewText(approval.root)}</div>
                {approval.query !== undefined && (
                  <div>Search {reviewText(approval.query)}</div>
                )}
              </div>
            }
            acceptLabel="Allow once"
            declineLabel="Decline"
            disabled={state.acting}
            onDecision={(allowed) =>
              controller.answerApproval(
                approval.reviewId,
                allowed ? "approve_once" : "decline"
              )
            }
          />
        )}
        {question && (
          <div className="shrink-0 px-3 py-2">
            <QuestionPrompt
              key={question.questionId}
              input={{
                questions: [
                  {
                    question: question.question,
                    options: question.options.map((label) => ({ label })),
                  },
                ],
              }}
              onSubmit={async (survey) => {
                const answer = survey.singleAnswer();
                return answer
                  ? controller.answerQuestion(question.questionId, answer)
                  : false;
              }}
              disabled={!state.questionReady || state.acting}
            />
          </div>
        )}
        {librarySelection && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2 text-xs">
            <p>The agent is asking for a Library reference.</p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={state.acting}
              onClick={() =>
                setLibraryRequest({
                  scope: state.scope,
                  selectionId: librarySelection.selectionId,
                })
              }
            >
              {state.librarySelectionRetry
                ? "Review answer"
                : "Choose reference"}
            </Button>
          </div>
        )}
        <div className="shrink-0 p-3">
          {state.imageInput && (
            <input
              key={`png-${state.scope}`}
              ref={pngPicker}
              type="file"
              accept="image/png,.png"
              aria-label="Select PNG"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                input.value = "";
                if (file)
                  void controller.pickAttachment(state.scope, "png", file);
              }}
            />
          )}
          {(state.fileInput || state.fileReferenceInput) && (
            <input
              key={`file-${state.scope}`}
              ref={filePicker}
              type="file"
              aria-label="Select file to attach"
              className="hidden"
              onChange={(event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                input.value = "";
                // Small files go directly, others by reference.
                if (file) void controller.pickFile(state.scope, file);
              }}
            />
          )}
          {state.attachmentReading && (
            <p
              role="status"
              className="text-muted-foreground px-1 pb-1 text-xs"
            >
              Reading attachment…
            </p>
          )}
          {state.attachmentDraft &&
            (state.attachmentDraft.error ||
              !(state.attachmentDraft.kind === "image"
                ? state.selectedImageInput
                : state.attachmentDraft.kind === "png"
                  ? state.imageInput
                  : state.attachmentDraft.kind === "file"
                    ? state.fileInput
                    : state.fileReferenceInput)) && (
              <p
                role="status"
                className="text-muted-foreground px-1 pb-1 text-xs"
              >
                {state.attachmentDraft.error ??
                  (state.attachmentDraft.kind === "png" ||
                  state.attachmentDraft.kind === "image"
                    ? "This connection cannot use the attached PNG. Remove it from this draft or use a compatible connection."
                    : "This chat cannot inspect the attached file. Remove it to send the message by itself.")}
              </p>
            )}
          {state.attachmentNotice && (
            <p
              role="status"
              className="text-muted-foreground px-1 pb-1 text-xs"
            >
              {state.attachmentNotice}
            </p>
          )}
          {(state.commandRunning || state.commandNotice) && (
            <div className="flex items-center gap-2 px-1 pb-1 text-xs">
              <span role="status">
                {state.commandRunning === "compact"
                  ? "Compacting…"
                  : state.commandRunning === "fork"
                    ? "Creating fork…"
                    : state.commandNotice}
              </span>
              {state.commandFork && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => void controller.select(state.commandFork)}
                >
                  Open fork
                </Button>
              )}
            </div>
          )}
          <NativeComposerTray
            controller={controller}
            view={state}
            onReturnedText={(text) =>
              void draft.current?.appendText(text, MAX_DRAFT_BYTES)
            }
          />
          {/* Draft binding and submissionScope handle chat changes. Keep the
            composer mounted so model reattachment preserves its popovers. */}
          <AgentComposer
            access={{
              mode: state.permissionMode?.mode ?? "restricted",
              available: state.permissionModeAvailable,
              uncertain: state.permissionModeUncertain,
              onRetry: () => void controller.checkPermissionMode(),
              busy:
                state.permissionModeBusy ||
                state.loading ||
                state.acting ||
                state.submitting ||
                state.profileBusy,
              error: state.permissionModeError,
              onChange: (mode) => void controller.selectPermissionMode(mode),
            }}
            draft={controller.composerDraft()}
            editing={
              state.queueDraft
                ? {
                    id: `${state.scope}:${state.queueDraft.inputId}`,
                    text: state.queueDraft.text,
                    label: "Editing queued message",
                    busy: state.acting,
                    allowEmpty: state.queueDraft.allowEmpty,
                    onSave: (text) => controller.saveQueueDraft(text),
                    onCancel: () => controller.closeQueueDraft(),
                  }
                : undefined
            }
            autofocus={autofocus}
            catalog={catalog}
            className="@container"
            commands={controller.composerCommands.map((id) => ({
              id,
              run: () => controller.runComposerCommand(id),
            }))}
            attachments={
              state.attachmentDraft &&
              !state.attachmentReading && (
                <NativeAttachmentCard
                  name={state.attachmentDraft.name}
                  size={state.attachmentDraft.size}
                  png={state.attachmentDraft.kind === "png"}
                  preview={attachmentPreview}
                  mimeType={state.attachmentDraft.mimeType}
                  video={state.attachmentDraft.preview}
                  onRemove={() => controller.removeAttachment(state.scope)}
                />
              )
            }
            onAttachmentTransfer={transferAttachment}
            awaitSubmission
            canSubmit={
              controller.canSubmit &&
              (!state.goalIntent || controller.canStartGoal)
            }
            busy={!!turn}
            submitting={state.submitting}
            isStreaming={streamingControlsOnly}
            emptyAction={
              resumable || (pausing && !(goalTurn && state.goal?.goal?.paused))
                ? {
                    label: "Resume",
                    icon: <PlayIcon className="size-3.5 fill-current" />,
                    onClick: () => void controller.resumeTurn(),
                  }
                : state.acting
                  ? undefined
                  : running && !turn?.paused
                    ? {
                        label: "Pause",
                        icon: <SquareIcon className="size-3.5" />,
                        onClick: () => void controller.control("pause"),
                      }
                    : controller.canResumeQueue && queued > 0 && !state.acting
                      ? {
                          label: "Resume queue",
                          icon: <PlayIcon className="size-3.5 fill-current" />,
                          onClick: () =>
                            void controller.editQueue({ action: "resume" }),
                        }
                      : undefined
            }
            submissionScope={state.scope}
            draftRef={draft}
            onSubmit={(text) => controller.submit(text, state.scope)}
            onStop={() => void controller.control("stop")}
            actions={{
              files:
                state.fileInput || state.fileReferenceInput
                  ? {
                      disabled:
                        state.goalIntent ||
                        !(
                          controller.canAttach("file") ||
                          controller.canAttach("reference")
                        ),
                      onSelect: () => filePicker.current?.click(),
                    }
                  : undefined,
              image: state.imageInput
                ? {
                    disabled: state.goalIntent || !controller.canAttach("png"),
                    onSelect: () => pngPicker.current?.click(),
                  }
                : undefined,
              library:
                workspaceId && state.imageInput
                  ? {
                      disabled: state.acting || state.goalIntent,
                      onSelect: () => setLibraryScope(state.scope),
                    }
                  : undefined,
              goal: {
                active: state.goalIntent,
                offered: !!bridge.startGoal && controller.offers("goals"),
                disabled: state.acting || !controller.canStartGoal,
                removeDisabled: state.acting,
                onChange: (active) => controller.selectGoalIntent(active),
              },
              plan: {
                active: state.operatingRegime === "plan",
                offered: !!bridge.submitInRegime,
                disabled: state.acting,
                onChange: (active) =>
                  controller.selectOperatingRegime(active ? "plan" : "act"),
              },
            }}
            modelLeading={<ContextMeter usage={contextUsage} />}
            model={{
              profiles: state.profiles,
              defaultUnavailable: connectionRequired,
              busy:
                state.profileBusy || state.acting || state.permissionModeBusy,
              onSelect:
                bridge.selectProfile && !controller.fixedSession
                  ? (selection) => void controller.selectProfile(selection)
                  : undefined,
              onRefresh: () => void controller.readProfiles(),
              refreshError: state.profileReadError,
              effort: state.effort,
              ultraAvailable: controller.ultraAvailability,
              ultraOffered: controller.offers("delegation"),
              goal: state.goalIntent,
              onEffort: (effort) => controller.selectEffort(effort),
            }}
          />
          {workspaceId && state.imageInput && libraryScope === state.scope && (
            <AgentLibraryAttachmentPicker
              open
              single
              onOpenChange={(open) => {
                if (!open) setLibraryScope(null);
              }}
              onAttach={([pin]) => {
                if (!pin) return;
                void controller.pickLibraryImage(
                  state.scope,
                  `Library: ${pin.title}`,
                  (maxBytes) => readLibraryPng(pin.id, maxBytes)
                );
              }}
            />
          )}
          {librarySelection &&
            libraryRequest?.scope === state.scope &&
            libraryRequest.selectionId === librarySelection.selectionId && (
              <AgentLibraryAttachmentPicker
                key={librarySelection.selectionId}
                open
                single
                onOpenChange={(open) => {
                  if (!open) setLibraryRequest(null);
                }}
                onAttach={([pin]) => {
                  if (pin)
                    void controller.answerLibrarySelection(
                      librarySelection.selectionId,
                      {
                        id: pin.id,
                        readPng: (maxBytes) => readLibraryPng(pin.id, maxBytes),
                      }
                    );
                }}
                request={{
                  initialQuery: librarySelection.initialSearchQuery,
                  busy: state.acting,
                  error: state.librarySelectionError,
                  skip: () => {
                    void controller.answerLibrarySelection(
                      librarySelection.selectionId,
                      "skip"
                    );
                  },
                  retry: state.librarySelectionRetry
                    ? () => {
                        void controller.answerLibrarySelection(
                          librarySelection.selectionId,
                          "retry"
                        );
                      }
                    : undefined,
                }}
              />
            )}
        </div>
      </div>
      {!subagentsInTabs && (
        <NativeSubagentActivityPanel subagents={state.subagents} />
      )}
    </ComposerDropArea>
  );
}

async function readLibraryPng(
  id: string,
  maxBytes: number
): Promise<ArrayBuffer> {
  const source = await readLibraryAttachment(id);
  if (!source) throw new Error("library_image_unavailable");
  return encodeLibraryPng(source, maxBytes);
}

function reviewText(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}
