"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  DesktopNativeChat,
  NativeChatMessage,
  NativeChatReadiness,
} from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { readLibraryAttachment } from "@/app/(library)/library/attachment";
import { encodeLibraryPng } from "@/lib/agent-chat/image-attachment";
import {
  CheckIcon,
  FolderIcon,
  PlayIcon,
  SquareIcon,
  LibraryIcon,
  PaperclipIcon,
  PlusIcon,
  GoalIcon,
  ListChecksIcon,
  ImageIcon,
  XIcon,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@app/ui/ai-elements/conversation";
import {
  ChatMessageView,
  PendingTurnIndicator,
  QuestionPrompt,
} from "@/kits/agent-chat";
import {
  NativeChatController,
  type NativeChatEditorSurfaces,
} from "@/lib/agent-chat/native-chat-controller";
import { subscribeToNativeNotificationFocus } from "@/lib/desktop/agent-focus-session";
import type { ComposerCatalog, ComposerController } from "@/kits/composer";
import { AgentApprovalPrompt } from "../shared/agent-approval";
import { AgentLibraryAttachmentPicker } from "../shared/agent-library-attachment-picker";
import {
  AgentComposerInput,
  type ComposerCommandAction,
} from "../shared/agent-composer-input";
import { useWorkspaceFileMentions } from "../shared/use-workspace-composer-catalog";
import { NativeComposerTray } from "./native-composer-tray";
import { ContextMeter } from "../shared/context-meter";
import { computeContextUsage } from "@/lib/agent-chat";
import { cn } from "@app/ui/lib/utils";
import styles from "./agent-pane.module.css";
import { NativeSideChatPanel } from "./native-side-chat-panel";
import { NativeTurnArtifacts } from "./native-turn-summary";
import { NativeTurnActivity } from "./native-turn-activity";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeContextLimitPanel } from "./native-context-limit-panel";
import { NativeHooksPanel } from "./native-hooks-panel";
import { NativeMessageRevisionPanel } from "./native-message-revision-panel";
import { NativeSubagentsPanel } from "./native-subagents-panel";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@app/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@app/ui/components/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@app/ui/components/popover";
import { NativeChatHeader, NativeModelPicker } from "./native-chat-controls";

const NO_COMMANDS: ComposerCatalog["commands"] = [];
const COMMAND_DESCRIPTIONS = {
  compact: "Summarize earlier context while keeping the transcript",
  fork: "Create a separate chat from the latest committed message",
};
const MAX_DRAFT_BYTES = 512 * 1024;
const APPROVAL_ACTION = {
  read_file: "Read file",
  list_files: "List folder",
  search_text: "Search files",
} as const;
const selectionMemory = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};

export function NativeAgentPaneGate({
  bridge,
  selectionKey,
  workspaceId,
  initialSession,
  editorSurfaces,
  legacy,
}: {
  bridge: DesktopNativeChat;
  selectionKey?: string;
  workspaceId?: string;
  initialSession: string | null;
  editorSurfaces?: NativeChatEditorSurfaces;
  legacy: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<{
    bridge: DesktopNativeChat;
    attempt: number;
    readiness: NativeChatReadiness | null;
  }>();
  useEffect(
    () =>
      NativeChatController.watchReadiness(bridge, (readiness) =>
        setSelection({ bridge, attempt, readiness })
      ),
    [bridge, attempt]
  );
  const readiness =
    selection?.bridge === bridge && selection.attempt === attempt
      ? selection.readiness
      : undefined;
  if (readiness === "legacy") return legacy;
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
    !!workspaceId &&
    !!bridge.profiles &&
    !!bridge.selectProfile;
  if (!starting && readiness !== "native-ready" && !connectionRequired)
    return (
      <div className="flex flex-col gap-2 px-3 py-2 text-xs">
        <span role="alert" className="text-destructive">
          {readiness === null
            ? "Couldn't check chat availability."
            : (nativeChatConnectionNote[readiness] ??
              "Native chat is unavailable.")}
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
      editorSurfaces={editorSurfaces}
    />
  );
}

/** Shown only when the person must act outside the chat before choosing. */
const nativeChatConnectionNote: Partial<Record<NativeChatReadiness, string>> = {
  "native-provider-key-required":
    "Add an API key for the selected provider in Desktop settings, or choose another model.",
  "native-provider-model-unavailable":
    "The selected model is unavailable. Choose another model.",
  "native-provider-endpoint-https-required":
    "Native chat requires HTTPS for an endpoint on another device. Update the saved endpoint in Desktop settings, or choose another model.",
  "native-provider-endpoint-approval-required":
    "Save the selected endpoint in Desktop settings and approve its address, or choose another model.",
};

export function NativeAgentPane({
  bridge,
  starting = false,
  connectionRequired = false,
  connectionNote,
  selectionKey,
  workspaceId,
  initialSession,
  initialProfileId,
  startNewChat = false,
  editorSurfaces,
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
  initialProfileId?: string;
  startNewChat?: boolean;
  editorSurfaces?: NativeChatEditorSurfaces;
}) {
  const controller = useMemo(
    () =>
      new NativeChatController(
        bridge,
        selectionMemory,
        selectionKey && `grida.nativeChat.${selectionKey}`,
        editorSurfaces,
        !!workspaceId
      ),
    [bridge, selectionKey, editorSurfaces, workspaceId]
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const mentions = useWorkspaceFileMentions(workspaceId);
  const catalog = useMemo(
    () => ({ commands: NO_COMMANDS, mentions }),
    [mentions]
  );
  const draft = useRef<Pick<ComposerController, "appendText">>(null);
  const pngPicker = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const [libraryScope, setLibraryScope] = useState<number | null>(null);
  const [libraryRequest, setLibraryRequest] = useState<{
    scope: number;
    selectionId: string;
  } | null>(null);
  const [subagentsScope, setSubagentsScope] = useState<number | null>(null);
  const side = state.sideChat;
  useEffect(() => {
    const profile =
      initialProfileId ??
      (workspaceId && initialSession
        ? new URLSearchParams(window.location.hash.slice(1)).get("chat-profile")
        : null);
    if (starting) return;
    if (connectionRequired) controller.connectForSelection();
    else controller.connect(initialSession, profile, startNewChat);
    const stopFocus =
      workspaceId &&
      subscribeToNativeNotificationFocus(
        bridge,
        workspaceId,
        (sessionId, profileId) =>
          void controller.focusChat(sessionId, profileId)
      );
    return () => {
      if (stopFocus) stopFocus();
      controller.disconnect();
    };
  }, [
    bridge,
    controller,
    initialSession,
    initialProfileId,
    startNewChat,
    workspaceId,
    connectionRequired,
    starting,
  ]);
  const snapshot = state.observation?.snapshot;
  const editHistory = controller.canReviseHistory && !state.revisionDraft;
  const turn = snapshot?.current;
  const running =
    turn?.disposition === "running" && !turn.paused && !turn.cancelled;
  const canResume =
    turn?.disposition === "suspended" && turn.paused && !turn.cancelled;
  const wakeup = state.scheduledWakeup;
  const suspendedCheckIn =
    !!wakeup &&
    turn?.turnId === wakeup.turnId &&
    turn.disposition === "suspended" &&
    !turn.paused &&
    !turn.cancelled &&
    (wakeup.status === "waiting" || wakeup.status === "cancelled");
  const canContinue = suspendedCheckIn && wakeup.status === "cancelled";
  const goalTurn =
    !!turn && state.goal?.goal?.reservation?.turnId === turn.turnId;
  // A paused turn resumes from the composer; a Goal's own pause resumes from
  // its strip.
  const resumable = canResume && !(goalTurn && state.goal?.goal?.paused);
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
  // One short state line. Questions, approvals, the queue and each turn's
  // header already show their own state in the conversation.
  const status = state.loading
    ? null
    : turn?.cancelled
      ? "Stopping…"
      : canResume || turn?.paused
        ? "Paused"
        : turn?.disposition === "interrupted"
          ? "Interrupted"
          : running || state.repairing
            ? "Working…"
            : null;

  const selectedProfile =
    state.profiles?.saved.find((p) => p.id === state.profiles?.active) ??
    state.profiles?.choices.find((p) => p.id === state.profiles?.active);
  const contextWindow =
    selectedProfile?.contextWindow ??
    (state.profiles?.active === null
      ? state.profiles.defaultContextWindow
      : undefined);
  const contextUsage = computeContextUsage(
    state.messages.map((message) => ({
      role: message.role,
      parts: [{ type: "text", text: message.text }],
    })),
    contextWindow
  );
  const blocks = turn_activity.group(
    state.messages,
    state.turnRecords,
    snapshot?.current,
    snapshot?.latest
  );
  const turnRecord = (turnId: string | undefined) =>
    turnId
      ? state.turnRecords.find((record) => record.turnId === turnId)
      : undefined;
  const renderMessage = (message: NativeChatMessage) => {
    const record = turnRecord(message.turnId);
    // The first user message of a goal-start turn is the one that set it.
    const goalStart =
      record?.goalStart &&
      state.messages.find(
        (candidate) =>
          candidate.role === "user" && candidate.turnId === message.turnId
      )?.messageId === message.messageId;
    return (
      <ChatMessageView
        key={message.messageId}
        actions={
          message.role === "user"
            ? {
                ...(editHistory && {
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
            : record?.settledAtMs !== undefined
              ? { sentAtMs: record.settledAtMs }
              : undefined
        }
        message={{
          id: message.messageId,
          role: message.role,
          parts: [{ type: "text", text: message.text }],
        }}
      />
    );
  };

  return (
    <div
      data-testid="workspace-native-chat"
      className="flex min-h-0 flex-1 flex-col"
    >
      <NativeChatHeader controller={controller} state={state} />
      {(state.profileError || state.catalogEntryError) && (
        <p role="alert" className="px-3 py-1 text-xs text-destructive">
          {state.profileError ?? state.catalogEntryError}
        </p>
      )}
      <Dialog
        open={state.contextLimitOpen || state.hooksOpen}
        onOpenChange={(open) => {
          if (!open) controller.closeWorkspaceSettings();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Workspace settings</DialogTitle>
            <DialogDescription>
              Agent settings for every chat in this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 flex flex-col">
            {state.contextLimitOpen && (
              <NativeContextLimitPanel controller={controller} state={state} />
            )}
            {state.hooksOpen && (
              <NativeHooksPanel controller={controller} state={state} />
            )}
          </div>
        </DialogContent>
      </Dialog>
      {(state.canReadEarlier ||
        state.earlierMessages ||
        state.earlierError) && (
        <div className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-2 px-3 py-1 text-xs">
          {state.earlierMessages && <span>Viewing earlier messages</span>}
          {state.canReadEarlier && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.readingEarlier || state.loading}
              onClick={() => void controller.showEarlierMessages()}
            >
              {state.readingEarlier
                ? "Loading earlier messages…"
                : "Earlier messages"}
            </Button>
          )}
          {state.earlierMessages && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.readingEarlier}
              onClick={() => controller.showLatestMessages()}
            >
              Back to latest
            </Button>
          )}
          {state.earlierError && (
            <span role="status">{state.earlierError}</span>
          )}
        </div>
      )}
      {connectionRequired && !state.scope && (
        <div className="text-muted-foreground px-3 py-1 text-xs">
          {connectionNote && <p>{connectionNote}</p>}
          {state.profiles &&
            state.profiles.choices.length + state.profiles.saved.length ===
              0 && (
              <p>Add a provider in Desktop settings, then refresh models.</p>
            )}
        </div>
      )}
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
          {/* See test/desktop-agent-chat-turn-activity.md. */}
          {blocks.map((block) =>
            block.kind === "turn" ? (
              <NativeTurnActivity
                key={block.turnId}
                block={block}
                renderMessage={renderMessage}
              />
            ) : (
              renderMessage(block.message)
            )
          )}
          {running &&
            !state.earlierMessages &&
            !retrying &&
            state.messages.at(-1)?.role !== "assistant" && (
              <PendingTurnIndicator />
            )}
          {/* See test/desktop-agent-chat-transcript-history.md. */}
          {!turn &&
            !state.earlierMessages &&
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
        <div role="status" className="px-3 pt-2 text-xs text-muted-foreground">
          Opening edit…
        </div>
      ) : null}
      {side && (
        <NativeSideChatPanel
          controller={side}
          close={() => void controller.closeSideChat()}
          draftUnavailable={state.steering || state.acting}
          addToDraft={(turnId) =>
            controller.stageSideAnswer(
              side,
              turnId,
              (text) =>
                draft.current?.appendText(text, MAX_DRAFT_BYTES) ?? false
            )
          }
        />
      )}
      {status && (
        <div role="status" className="px-3 pt-2 text-xs text-muted-foreground">
          {status}
          {turn && queued > 0 && (
            <>
              {" "}
              ·{" "}
              {queued === 1 ? "1 message queued" : `${queued} messages queued`}
            </>
          )}
        </div>
      )}
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
          description="The agent is asking for additional read access."
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
            {state.librarySelectionRetry ? "Review answer" : "Choose reference"}
          </Button>
        </div>
      )}
      {(wakeup || state.wakeupError) && (
        <div className="shrink-0 space-y-1 border-t px-3 py-2 text-xs">
          {wakeup && (
            <>
              <p className="font-medium">
                {wakeup.status === "cancelled"
                  ? "Check-in cancelled"
                  : wakeup.status === "stopped"
                    ? "Check-in stopped"
                    : wakeup.status === "delivered"
                      ? "Check-in delivered"
                      : wakeup.status === "paused"
                        ? "Check-in paused"
                        : "Scheduled check-in"}
              </p>
              <p className="wrap-anywhere whitespace-pre-wrap">
                {wakeup.reason}
              </p>
              <time
                className="block text-muted-foreground"
                dateTime={new Date(wakeup.dueAtMs).toISOString()}
              >
                {new Date(wakeup.dueAtMs).toLocaleString()}
              </time>
              <div className="flex flex-wrap items-center gap-1">
                {controller.canControlWakeup("cancel") && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => void controller.controlWakeup("cancel")}
                  >
                    Cancel check-in
                  </Button>
                )}
                {controller.canControlWakeup("recover") && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void controller.controlWakeup("recover")}
                  >
                    Restore schedule
                  </Button>
                )}
              </div>
            </>
          )}
          {state.wakeupError && (
            <p role="alert" className="text-destructive">
              {state.wakeupError}
            </p>
          )}
        </div>
      )}
      <Dialog
        open={subagentsScope === state.scope}
        onOpenChange={(open) => {
          if (!open) setSubagentsScope(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Subagents</DialogTitle>
            <DialogDescription>
              View assignments and continue work with the agents in this chat.
            </DialogDescription>
          </DialogHeader>
          {state.subagents && (
            <NativeSubagentsPanel controller={state.subagents} hideToggle />
          )}
        </DialogContent>
      </Dialog>
      <div className="shrink-0 p-3">
        {state.reviewConfiguration && (
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="mb-1"
            disabled={state.acting}
            aria-label="Cancel settings review"
            onClick={() => controller.setConfigurationReview(false)}
          >
            Settings review on send
          </Button>
        )}
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
        {state.fileInput && (
          <input
            key={`file-${state.scope}`}
            ref={filePicker}
            type="file"
            aria-label="Select file to inspect"
            className="hidden"
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (file)
                void controller.pickAttachment(state.scope, "file", file);
            }}
          />
        )}
        {(state.attachmentDraft || state.attachmentReading) && (
          <div className="flex items-center gap-2 px-1 pb-1 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {state.attachmentReading
                ? "Reading attachment…"
                : state.attachmentDraft?.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.acting}
              onClick={() => controller.removeAttachment(state.scope)}
            >
              {state.attachmentDraft?.kind === "png"
                ? "Remove PNG"
                : "Remove file"}
            </Button>
          </div>
        )}
        {state.attachmentDraft &&
          (state.attachmentDraft.error ||
            !(state.attachmentDraft.kind === "png"
              ? state.imageInput
              : state.fileInput)) && (
            <p
              role="status"
              className="text-muted-foreground px-1 pb-1 text-xs"
            >
              {state.attachmentDraft.error ??
                (state.attachmentDraft.kind === "png"
                  ? "This connection cannot use the attached PNG. Remove it from this draft or use a compatible connection."
                  : "This chat cannot inspect the attached file. Remove it to send the message by itself.")}
            </p>
          )}
        {state.attachmentNotice && (
          <p role="status" className="text-muted-foreground px-1 pb-1 text-xs">
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
        <AgentComposerInput
          key={state.scope}
          catalog={catalog}
          className="@container"
          commandActions={[
            ...(bridge.submitInRegime &&
            state.scope > 0 &&
            !state.loading &&
            !state.profileBusy &&
            !state.steering &&
            !state.acting
              ? [
                  {
                    id: "plan",
                    title: "plan",
                    description: "Plan before making changes",
                    standalone: true as const,
                    run: () => controller.selectOperatingRegime("plan"),
                  },
                ]
              : []),
            ...(controller.canStartGoal
              ? [
                  {
                    id: "goal",
                    title: "goal",
                    description:
                      "Work toward a goal with automatic continuation",
                    standalone: true as const,
                    run: () => controller.selectGoalIntent(true),
                  },
                ]
              : []),
            ...state.commands.map(
              (command): ComposerCommandAction => ({
                id: command,
                title: command,
                description: COMMAND_DESCRIPTIONS[command],
                standalone: true,
                run: () => controller.runCommand(command),
              })
            ),
          ]}
          onCommandSelect={(command) => {
            if (command.id === "plan") {
              controller.selectOperatingRegime("plan");
              return true;
            }
            if (command.id === "goal") {
              controller.selectGoalIntent(true);
              return true;
            }
            return false;
          }}
          attach={false}
          onAttachmentTransfer={({ resources }) =>
            void controller.pickTransferredAttachment(state.scope, resources)
          }
          operableFiles={false}
          awaitSubmission
          canSubmit={
            controller.canSubmit &&
            (!state.goalIntent || controller.canStartGoal)
          }
          busy={!!turn}
          isStreaming={streamingControlsOnly}
          emptyAction={
            state.acting
              ? undefined
              : resumable
                ? {
                    label: "Resume",
                    icon: <PlayIcon className="size-3.5 fill-current" />,
                    onClick: () => void controller.control("resume"),
                  }
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
          placeholder={
            connectionRequired && !state.scope
              ? "Choose a model to start chatting…"
              : state.goalIntent
                ? "Describe the goal…"
                : state.operatingRegime === "plan"
                  ? "What would you like to plan?"
                  : state.attachmentDraft
                    ? "Add a message to send this attachment…"
                    : turn || snapshot?.admissionPaused || queued
                      ? "Queue a follow-up…"
                      : undefined
          }
          submissionScope={state.scope}
          draftRef={draft}
          onSubmit={(text) => controller.submit(text, state.scope)}
          onStop={() => void controller.control("stop")}
          toolbarStart={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Add to message"
                    title="Add to message"
                    className="shrink-0 rounded-full text-muted-foreground"
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-72">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Add
                  </DropdownMenuLabel>
                  {state.fileInput && (
                    <DropdownMenuItem
                      disabled={
                        state.goalIntent || !controller.canAttach("file")
                      }
                      onSelect={() => filePicker.current?.click()}
                    >
                      <PaperclipIcon className="size-4" />
                      Files
                    </DropdownMenuItem>
                  )}
                  {state.imageInput && (
                    <DropdownMenuItem
                      disabled={
                        state.goalIntent || !controller.canAttach("png")
                      }
                      onSelect={() => pngPicker.current?.click()}
                    >
                      <ImageIcon className="size-4" />
                      Image
                    </DropdownMenuItem>
                  )}
                  {workspaceId && state.imageInput && (
                    <DropdownMenuItem
                      disabled={state.acting || state.goalIntent}
                      onSelect={() => setLibraryScope(state.scope)}
                    >
                      <LibraryIcon className="size-4" />
                      Library
                    </DropdownMenuItem>
                  )}
                  {bridge.startGoal && (
                    <DropdownMenuItem
                      disabled={
                        state.acting ||
                        state.goalIntent ||
                        !controller.canStartGoal
                      }
                      onSelect={() => controller.selectGoalIntent(true)}
                    >
                      <GoalIcon className="size-4" />
                      Goal
                      <span className="text-muted-foreground">
                        Set a goal to keep pursuing
                      </span>
                    </DropdownMenuItem>
                  )}
                  {bridge.submitInRegime && (
                    <DropdownMenuItem
                      disabled={state.acting || state.steering}
                      onSelect={() =>
                        controller.selectOperatingRegime(
                          state.operatingRegime === "plan" ? "act" : "plan"
                        )
                      }
                    >
                      <ListChecksIcon className="size-4" />
                      Plan mode
                      <span className="text-muted-foreground">
                        {state.operatingRegime === "plan"
                          ? "Turn plan mode off"
                          : "Turn plan mode on"}
                      </span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="shrink-0 gap-1 px-1.5 text-muted-foreground"
                    aria-label="Access: This project"
                  >
                    <FolderIcon className="size-3.5" />
                    <span className="hidden @[26rem]:inline">This project</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  className="w-80 p-1 text-sm"
                >
                  <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
                    What can the agent access?
                  </p>
                  <div className="flex items-start gap-2 rounded-md px-2 py-1.5">
                    <FolderIcon className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p>This project</p>
                      <p className="text-xs text-muted-foreground">
                        Reads files in this project and edits through the open
                        editor. No other folders, commands or internet.
                      </p>
                    </div>
                    <CheckIcon className="mt-0.5 size-4 shrink-0" />
                  </div>
                </PopoverContent>
              </Popover>
              {state.operatingRegime === "plan" && (
                <IntentChip
                  icon={<ListChecksIcon />}
                  label="Plan"
                  disabled={state.acting}
                  onRemove={() => controller.selectOperatingRegime("act")}
                />
              )}
              {state.goalIntent && (
                <IntentChip
                  icon={<GoalIcon />}
                  label="Goal"
                  disabled={state.acting}
                  onRemove={() => controller.selectGoalIntent(false)}
                />
              )}
              {canContinue ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={state.acting}
                  aria-label="Continue"
                  title="Continue"
                  className="shrink-0"
                  onClick={() => void controller.control("resume")}
                >
                  <PlayIcon className="size-3.5" />
                  <span className="hidden @md:inline">Continue</span>
                </Button>
              ) : null}
            </>
          }
          toolbarEnd={
            <>
              <ContextMeter usage={contextUsage} />
              <NativeModelPicker
                profiles={state.profiles}
                defaultUnavailable={connectionRequired}
                busy={state.profileBusy || state.acting}
                onSelect={(selection) =>
                  void controller.selectProfile(selection)
                }
                onRefresh={() => void controller.readProfiles()}
                effort={state.effort}
                ultraAvailable={state.effortAvailable}
                onEffort={(effort) => controller.selectEffort(effort)}
              />
            </>
          }
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

/** A removable composer intent. The icon turns into a remove button on hover. */
function IntentChip({
  icon,
  label,
  disabled,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Remove ${label.toLowerCase()}`}
      title={`Remove ${label.toLowerCase()}`}
      onClick={onRemove}
      className="group/chip flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5"
    >
      <span className="group-hover/chip:hidden">{icon}</span>
      <XIcon className="hidden group-hover/chip:block" />
      {label}
    </button>
  );
}
