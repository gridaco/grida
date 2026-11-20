"use client";

import {
  useCallback,
  useContext,
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
  NativeChatProfileSelection,
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
import { MessageContextParts } from "@/kits/agent-chat/message-context-parts";
import {
  NativeChatController,
  type NativeChatEditorSurfaces,
  type NativeChatView,
  type NativeChatInitialComposer,
  type NativeChatFirstInput,
} from "@/lib/agent-chat/native-chat-controller";
import { PanelIsPresented } from "./workbench-panel-content";
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
import {
  SideChatPlacement,
  type SideChatPresentation,
} from "./side-chat-placement";
import { NativeTurnArtifacts } from "./native-turn-summary";
import { NativeAttachmentCard } from "./native-attachment-card";
import { NativeEarlierMessages } from "./native-earlier-messages";
import { NativeDisplayedReply } from "./native-displayed-reply";
import { NativeTurnActivity } from "./native-turn-activity";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { native_message_parts } from "@/lib/agent-chat/native-message-parts";
import { NativeMessageRevision } from "./native-message-revision";
import { NativeSubagentActivityPanel } from "./native-agent-activity";
import { SubagentPlacement } from "./subagent-placement";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";

import { NativeChatHeader } from "./native-chat-controls";
import { attachedChatActivity } from "@/lib/agent-chat/native-chat-activity";
import { ChatActivityIndicators } from "./chat-activity-indicators";

const NO_COMMANDS: ComposerCatalog["commands"] = [];
const MAX_DRAFT_BYTES = 512 * 1024;
const readNoActivity = () => null;
const subscribeNoActivity = () => () => {};
const readNoSvgSelection = () => undefined;
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
 * `take` hands the request over once (see `welcome-message.ts`); `waiting`
 * tells whether it is still there to take.
 */
export type NativeFirstMessage = Readonly<{
  profileId: string | null;
  composer?: NativeChatInitialComposer;
  waiting: () => boolean;
  take: () => NativeChatFirstInput | null;
}>;

type NativeChatPresentation = {
  subagentPlacement?: SubagentPlacement;
  /** Registered project folder to open from the access confirmation. */
  projectFolderId?: string;
  /** Lends the selected main chat's existing controller to its workspace. */
  onProcessesChange?: (
    processes: NativeBackgroundProcessController | null
  ) => void;
};

type ConnectionRecovery = {
  note: string;
  retry(): void;
  connected(selection: NativeChatProfileSelection): void;
};

export function NativeAgentPaneGate({
  bridge,
  selectionKey,
  workspaceId,
  projectFolderId,
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
  const [selection, setSelection] = useState<{
    bridge: DesktopNativeChat;
    attempt: number;
    readiness: NativeChatReadiness | null;
    recommendedProfileId?: string;
    recovered?: NativeChatProfileSelection;
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
      remembered
        ? {
            kind:
              message && !message.composer?.preparedSessionId ? "new" : "saved",
            id: remembered,
          }
        : null,
      message
        ? undefined
        : {
            memory: selectionMemory,
            key: selectionKey && `grida.nativeChat.${selectionKey}`,
            initialSession,
          },
      workspaceId ? "workspace" : "file"
    );
  }, [
    bridge,
    attempt,
    selectionKey,
    firstMessage,
    initialSession,
    workspaceId,
  ]);
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
  if (unavailable)
    return (
      <div className="flex flex-col gap-2 px-3 py-2 text-xs">
        <span role="alert" className="text-destructive">
          {readiness === null
            ? "Couldn't check chat availability."
            : (nativeChatConnectionNote[readiness] ??
              "Native chat is unavailable.")}
          {firstMessage?.waiting() &&
            " Your message from Home is still waiting to send."}
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
      recovery={
        connectionRequired && readiness
          ? {
              note:
                nativeChatConnectionNote[readiness] ??
                "Choose a model to start chat.",
              retry: () => setAttempt((current) => current + 1),
              connected: (recovered) =>
                setSelection({
                  bridge,
                  attempt,
                  readiness: "native-ready",
                  recovered,
                }),
            }
          : undefined
      }
      recovered={
        readiness === "native-ready" ? selection?.recovered : undefined
      }
      selectionKey={selectionKey}
      workspaceId={workspaceId}
      projectFolderId={projectFolderId}
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

/** Startup results a person can act on from the workspace. */
const nativeChatConnectionNote: Partial<Record<NativeChatReadiness, string>> = {
  "native-gateway-unavailable":
    "Grida Gateway is unavailable. Retry the connection or choose another model.",
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
  recovery,
  recovered,
  selectionKey,
  workspaceId,
  projectFolderId,
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
  recovery?: ConnectionRecovery;
  recovered?: NativeChatProfileSelection;
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
  const connectionRequired = !!recovery;
  const controller = useMemo(() => {
    const created = new NativeChatController(
      bridge,
      selectionMemory,
      selectionKey && `grida.nativeChat.${selectionKey}`,
      editorSurfaces,
      !!workspaceId
    );
    created.keepDrafts(COMPOSER_DRAFTS, workspaceId ?? "standalone", {
      sessionId:
        initialSession ?? firstMessage?.composer?.preparedSessionId ?? null,
      fromHome: firstMessage?.waiting() === true,
    });
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
    if (connectionRequired) {
      controller.connectForSelection();
      return () => controller.disconnect();
    }
    const message = firstMessage?.waiting() ? firstMessage : undefined;
    if (message && !initialSession)
      void controller
        .startChat(message.profileId, message.take, message.composer, recovered)
        .then(keep);
    else
      controller.connect(
        initialSession,
        profile ?? startupProfileId,
        recovered
      );
    const stopFocus =
      workspaceId &&
      subscribeToNativeNotificationFocus(
        bridge,
        workspaceId,
        (sessionId, profileId, side) =>
          side
            ? void controller.showSideChat(sessionId)
            : void controller.focusChat(sessionId, profileId)
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
    recovered,
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
      initialSession={initialSession}
      workspaceId={workspaceId}
      projectFolderId={projectFolderId}
      editorSurfaces={editorSurfaces}
      recovery={recovery}
      waitingForHome={!!recovery && firstMessage?.waiting()}
      draftRef={draft}
      subagentsInTabs={!!subagentPlacement}
      header={(state) => (
        <NativeChatHeader
          controller={controller}
          state={state}
          disabled={starting || connectionRequired}
          onChatSelected={() => draft.current?.focus()}
        />
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
      header={(state) => (
        <header className="flex h-10 shrink-0 items-center gap-2 px-3 text-xs font-medium">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {chat.sideChatTitle()}
          </span>
          <ChatActivityIndicators {...attachedChatActivity(state)} />
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
  initialSession,
  workspaceId,
  projectFolderId = workspaceId,
  editorSurfaces,
  recovery,
  waitingForHome,
  draftRef: draft,
  header,
  autofocus = true,
  testId = "workspace-native-chat",
  subagentsInTabs = false,
}: {
  controller: NativeChatController;
  bridge: DesktopNativeChat;
  initialSession?: string | null;
  workspaceId?: string;
  projectFolderId?: string;
  editorSurfaces?: NativeChatEditorSurfaces;
  /** No connection can run yet; the composer's model picker starts the chat. */
  recovery?: ConnectionRecovery;
  waitingForHome?: boolean;
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
  const awaitingProfiles =
    !!bridge.profiles && !controller.fixedSession && !state.profilesLoaded;
  const selectionRead = controller.modelSelectionRead;
  const modelReadError =
    (awaitingProfiles && state.profileReadError) ||
    (selectionRead === "failed" && state.profileError) ||
    null;
  const editorSelection = useSyncExternalStore(
    controller.subscribeToComposerEditorSelection,
    controller.readComposerEditorSelection,
    readNoSvgSelection
  );
  const subagentActivity = useSyncExternalStore(
    state.subagents?.subscribe ?? subscribeNoActivity,
    state.subagents?.read ?? readNoActivity,
    state.subagents?.read ?? readNoActivity
  );
  useEffect(() => {
    const refresh = () => {
      void controller.readProfiles();
      controller.checkObservation();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
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
  const [questionTranscript, setQuestionTranscript] =
    useState<HTMLDivElement | null>(null);
  const [libraryScope, setLibraryScope] = useState<number | null>(null);
  const activityOpen = !subagentsInTabs && !!subagentActivity?.open;
  const panelPresented = useContext(PanelIsPresented);
  const conversationPane = useRef<HTMLDivElement>(null);
  const attachmentId = controller.presentedAttachmentId;
  useEffect(() => {
    if (!attachmentId || !bridge.setPresented) return;
    const report = (visible: boolean) => {
      void bridge.setPresented?.(attachmentId, visible).catch(() => {});
    };
    report(panelPresented && !activityOpen);
    return () => report(false);
  }, [attachmentId, bridge, panelPresented, activityOpen]);
  const [libraryRequest, setLibraryRequest] = useState<{
    scope: number;
    selectionId: string;
  } | null>(null);
  const snapshot = state.observation?.snapshot;
  const editHistory = controller.canReviseHistory && !state.revisionDraft;
  const turn = state.connectionRecovery ? null : snapshot?.current;
  const interrupted = turn?.disposition === "interrupted";
  const running =
    turn?.disposition === "running" && !turn.paused && !turn.cancelled;
  const canResume = !!turn && controller.hasPausedTurn;
  const goalTurn =
    !!turn && state.goal?.goal?.reservation?.turnId === turn.turnId;
  // A paused turn resumes from the composer; a Goal's own pause resumes from
  // its strip.
  const resumable = canResume && !(goalTurn && state.goal?.goal?.paused);
  // Show Resume as soon as Pause is chosen; it waits for the pause to settle.
  const pausing =
    !!turn &&
    !interrupted &&
    !turn.cancelled &&
    (state.pausing === turn.turnId || turn.paused);
  const approval =
    turn?.disposition === "suspended" && !turn.paused && !turn.cancelled
      ? state.approvals[0]
      : undefined;
  const questions = turn && !turn.cancelled ? state.questions : [];
  const librarySelection = state.librarySelection;
  const stillWorking =
    running &&
    !pausing &&
    !approval &&
    !questions.some((question) => question.style === "answer_dependent");
  const outputStarted = state.messages.some(
    (message) =>
      message.turnId === turn?.turnId &&
      message.role === "assistant" &&
      (!!message.text || !!message.activity?.length)
  );
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
      !message.questionReply &&
      message.turnId &&
      !firstRequest.has(message.turnId)
    )
      firstRequest.set(message.turnId, message.messageId);
  const revisionEditor = state.revisionDraft && (
    <NativeMessageRevision
      key={state.revisionDraft.messageId}
      draft={state.revisionDraft}
      submitting={state.revisionSubmitting}
      effortAvailable={state.effortAvailable}
      disconnected={!!state.connectionRecovery}
      onChange={(text) => controller.changeRevisionText(text)}
      onCancel={() => controller.cancelRevision()}
      onSubmit={() => void controller.submitRevision()}
    />
  );
  const readState = state.selected
    ? controller.chatReadState(state.selected)
    : undefined;
  const replyId = readState?.replyId;
  const sessionId = state.selected;
  const [drawnReply, setDrawnReply] = useState<{
    node: HTMLDivElement;
    replyId: string;
    sessionId: string;
  } | null>(null);
  const bindReply = useCallback(
    (node: HTMLDivElement | null) => {
      setDrawnReply(
        node && replyId && sessionId ? { node, replyId, sessionId } : null
      );
    },
    [replyId, sessionId]
  );
  const renderMessage = (message: NativeChatMessage) => {
    if (message.messageId === state.revisionDraft?.messageId)
      return revisionEditor;
    const record = message.turnId ? records.get(message.turnId) : undefined;
    const goalStart =
      record?.goalStart &&
      !!message.turnId &&
      firstRequest.get(message.turnId) === message.messageId;
    return (
      <ChatMessageView
        key={message.messageId}
        ref={replyId === message.messageId ? bindReply : undefined}
        loadAttachmentPreview={controller.readAttachmentPreview}
        loadToolImage={controller.readToolImage}
        actions={
          message.role === "user"
            ? {
                // Inline revision is for plain-text requests.
                ...(editHistory &&
                  !message.questionReply &&
                  !message.attachments?.length &&
                  !message.displayParts?.length &&
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
        review={
          state.permissionModeReview && {
            workspaceName: state.permissionModeReview.workspaceName,
            workspaceId: projectFolderId,
          }
        }
        onAnswer={(confirmed) =>
          controller.answerPermissionModeReview(confirmed)
        }
      />
      <div
        ref={conversationPane}
        inert={activityOpen}
        className="flex min-h-0 flex-1 flex-col"
      >
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
        {recovery && (
          <div className="text-muted-foreground px-3 py-1 text-xs">
            <p role="status">{recovery.note}</p>
            {waitingForHome && (
              <p>Your message from Home is still waiting to send.</p>
            )}
            {state.profiles &&
              state.profiles.choices.length + state.profiles.saved.length ===
                0 && (
                <p>
                  Add a provider in Desktop settings, then return here to choose
                  a model.
                </p>
              )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.profileBusy}
              onClick={recovery.retry}
            >
              Retry
            </Button>
          </div>
        )}
        <workspace_links.Opener.Provider value={openWorkspaceLink}>
          <Conversation
            className="min-h-0 flex-1"
            initial="instant"
            resize={running ? "smooth" : "instant"}
          >
            {/* See test/desktop-agent-chat-scrollbar.md. */}
            <ConversationContent
              scrollbar="custom"
              className="gap-4 px-[max(0.75rem,calc((100%_-_48rem)/2))] py-4"
              scrollClassName="desktop-native-drag-scroll-viewport scroll-fade-y scroll-fade-4"
            >
              {sessionId && readState && (
                <NativeDisplayedReply
                  controller={controller}
                  sessionId={sessionId}
                  readState={readState}
                  pane={conversationPane}
                  message={
                    drawnReply?.sessionId === sessionId &&
                    drawnReply.replyId === replyId
                      ? drawnReply.node
                      : null
                  }
                  historyLoaded={controller.hasOpenedHistory}
                  presented={
                    panelPresented && !activityOpen && !state.connectionRecovery
                  }
                />
              )}
              <NativeEarlierMessages
                canLoad={state.canReadEarlier}
                loading={state.readingEarlier}
                error={state.earlierError}
                count={state.messages.length}
                onLoad={() => void controller.loadEarlierMessages()}
              />
              {/* See test/desktop-agent-chat-turn-activity.md. */}
              {/* A refresh may replace the target before a lost receipt is
                  confirmed. Keep its editor in the transcript for Retry. */}
              {state.revisionDraft &&
                !state.messages.some(
                  (message) =>
                    message.messageId === state.revisionDraft?.messageId
                ) &&
                revisionEditor}
              {blocks.map((block) =>
                block.kind === "turn" ? (
                  <NativeTurnActivity
                    key={block.turnId}
                    block={block}
                    renderMessage={renderMessage}
                    loadToolImage={controller.readToolImage}
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
              {stillWorking && (
                <PendingTurnIndicator
                  key={turn?.turnId}
                  progress={state.progressRevision}
                  immediate={!outputStarted}
                />
              )}
              <div ref={setQuestionTranscript} className="contents" />
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
        {!state.revisionDraft && state.revisionSubmitting ? (
          <div
            role="status"
            className="px-3 pt-2 text-xs text-muted-foreground"
          >
            Opening edit…
          </div>
        ) : null}
        {state.connectionRecovery === "reconnecting" && (
          <div
            role="status"
            className="px-3 pt-2 text-xs text-muted-foreground"
          >
            Reconnecting to this chat…
          </div>
        )}
        {state.connectionRecovery === "disconnected" && (
          <div
            role="alert"
            className="flex items-center gap-2 px-3 pt-2 text-xs"
          >
            <span className="flex-1">
              {controller.canReconnect
                ? "This chat is disconnected. Saved messages are still visible."
                : "This side chat has ended."}
            </span>
            {controller.canReconnect && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void controller.repair()}
              >
                Reconnect
              </Button>
            )}
          </div>
        )}
        {interrupted && (
          <div
            role="status"
            className="flex items-center gap-2 px-3 pt-2 text-xs"
          >
            <span className="flex-1">
              {turn.cancelled
                ? "This turn was interrupted before it finished stopping."
                : "This turn was interrupted. Review any partial work before continuing."}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.acting}
              onClick={() => void controller.control("stop")}
            >
              {turn.cancelled ? "Finish ending turn" : "End interrupted turn"}
            </Button>
          </div>
        )}
        {error && !state.connectionRecovery && (
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
        {questions.length > 0 && (
          <div className="max-h-[50%] shrink-0 space-y-2 overflow-y-auto px-3 py-2 empty:hidden">
            {questions.map((question, index) => (
              <QuestionPrompt
                key={JSON.stringify([state.scope, question.questionId])}
                dismissal={
                  question.expiresWithTurn
                    ? {
                        transcript: questionTranscript,
                        initiallyClosed: index > 0,
                      }
                    : undefined
                }
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
                submitDisabled={!state.questionReady || state.acting}
              />
            ))}
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
        <div className="shrink-0 px-[max(0.75rem,calc((100%_-_48rem)/2))] py-3">
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
              loading:
                state.permissionModeLoading ||
                (!state.scope &&
                  !!initialSession &&
                  !recovery &&
                  controller.supportsPermissionModeRead),
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
                    id: `${state.selected}:${state.queueDraft.inputId}`,
                    text: state.queueDraft.text,
                    label: "Editing queued message",
                    busy: state.acting,
                    saveDisabled:
                      state.queueLoading || !!state.connectionRecovery,
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
              (state.draftMessageContext ||
                (state.attachmentDraft && !state.attachmentReading)) && (
                <>
                  {state.draftMessageContext && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {state.draftMessageContext.displayParts.length ? (
                        <MessageContextParts
                          parts={state.draftMessageContext.displayParts}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Message context
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove message context"
                        disabled={!controller.canRemoveMessageContext}
                        onClick={() =>
                          controller.removeMessageContext(state.scope)
                        }
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  )}
                  {state.attachmentDraft && !state.attachmentReading && (
                    <NativeAttachmentCard
                      name={state.attachmentDraft.name}
                      size={state.attachmentDraft.size}
                      png={state.attachmentDraft.kind === "png"}
                      preview={attachmentPreview}
                      mimeType={state.attachmentDraft.mimeType}
                      video={state.attachmentDraft.preview}
                      onRemove={() => controller.removeAttachment(state.scope)}
                    />
                  )}
                </>
              )
            }
            allowEmptySubmit={
              !state.goalIntent &&
              !!state.draftMessageContext &&
              (!!state.draftMessageContext.displayParts.length ||
                !!state.attachmentDraft)
            }
            selectionContext={editorSelection}
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
                        confirmWithEscape: true,
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
            activeTurnId={turn?.turnId}
            submissionScope={state.scope}
            draftRef={draft}
            onSubmit={(text) =>
              controller.submitFromComposer(text, state.scope)
            }
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
              loading: awaitingProfiles || selectionRead === "loading",
              initialError: modelReadError,
              defaultUnavailable: !!recovery || selectionRead === "unavailable",
              busy:
                state.profileBusy || state.acting || state.permissionModeBusy,
              onSelect:
                bridge.selectProfile && !controller.fixedSession
                  ? async (selection) => {
                      if (recovery) {
                        if (await controller.selectConnection(selection))
                          recovery.connected(selection);
                      } else await controller.selectProfile(selection);
                    }
                  : undefined,
              onRefresh: () => {
                if (selectionRead === "failed")
                  void controller.select(state.selected);
                void controller.readProfiles();
              },
              refreshError: state.profileReadError,
              effort: state.effort,
              ultraAvailable: controller.ultraAvailability,
              ultraOffered: controller.offers("delegation"),
              goal: state.goalIntent,
              onEffort: recovery
                ? undefined
                : (effort) => controller.selectEffort(effort),
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
