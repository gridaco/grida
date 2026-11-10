"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { DesktopNativeChat } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Textarea } from "@app/ui/components/textarea";
import { MessageAction } from "@app/ui/ai-elements/message";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  SlidersHorizontalIcon,
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
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import type { ComposerController } from "@/kits/composer";
import { AgentApprovalPrompt } from "../shared/agent-approval";
import {
  AgentComposerInput,
  type ComposerCommandAction,
} from "../shared/agent-composer-input";
import { QueuedMessageRows } from "../shared/queued-messages";
import { NativeGoalPanel } from "./native-goal-panel";
import { NativeSideChatPanel } from "./native-side-chat-panel";
import { NativeTurnSummary } from "./native-turn-summary";
import { NativeContextLimitPanel } from "./native-context-limit-panel";
import { NativeMessageRevisionPanel } from "./native-message-revision-panel";
import { NativeSubagentsPanel } from "./native-subagents-panel";
import type { WorkspaceSurfaceHost } from "./workspace-surface-host";

const TEXT_CATALOG = { commands: [], mentions: [] };
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

export function NativeAgentPane({
  bridge,
  workspaceId,
  initialSession,
  editorSurfaces,
}: {
  bridge: DesktopNativeChat;
  workspaceId: string;
  initialSession: string | null;
  editorSurfaces?: WorkspaceSurfaceHost;
}) {
  const controller = useMemo(
    () =>
      new NativeChatController(
        bridge,
        selectionMemory,
        `grida.nativeChat.${workspaceId}`,
        editorSurfaces
      ),
    [bridge, workspaceId, editorSurfaces]
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const draft = useRef<Pick<ComposerController, "appendText">>(null);
  const pngPicker = useRef<HTMLInputElement>(null);
  const side = state.sideChat;
  useEffect(() => {
    controller.connect(initialSession);
    return () => controller.disconnect();
  }, [controller, initialSession]);
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
  const waitingForCheckIn = suspendedCheckIn && wakeup.status === "waiting";
  const canStop = !!turn && !turn.cancelled;
  const goalTurn =
    !!turn && state.goal?.goal?.reservation?.turnId === turn.turnId;
  const approval =
    turn?.disposition === "suspended" && !turn.paused && !turn.cancelled
      ? state.approvals[0]
      : undefined;
  const question = turn && !turn.cancelled ? state.questions[0] : undefined;
  const retrying =
    running && !question && snapshot?.retryNotBeforeMs !== undefined;
  const queued = snapshot?.queuedInputs ?? 0;
  const queue = state.queue;
  const previousQueueOffset = queue?.previousOffset ?? null;
  const nextQueueOffset = queue?.nextOffset ?? null;
  const streamingControlsOnly = running && !bridge.enqueue;
  const queueDisabled = !controller.queueCurrent || state.acting;
  const error = state.error ?? state.approvalError ?? state.questionError;
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
              ? canContinue
                ? "Check-in cancelled"
                : waitingForCheckIn
                  ? "Waiting for check-in"
                  : "Waiting for input"
              : turn?.disposition === "interrupted"
                ? "Interrupted"
                : running
                  ? retrying
                    ? "Retrying after rate limit…"
                    : "Working…"
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
      {(state.profiles || state.profileError) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2 text-xs">
          {state.profiles && (
            <select
              aria-label="Model connection"
              className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1"
              value={
                state.profiles.active
                  ? `saved:${state.profiles.active}`
                  : "default"
              }
              disabled={state.profileBusy || state.acting}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === "default")
                  void controller.selectProfile({ kind: "default" });
                else {
                  const [kind, id] = value.split(":");
                  if ((kind === "new" || kind === "saved") && id)
                    void controller.selectProfile({ kind, id });
                }
              }}
            >
              <option value="default">Default connection</option>
              {state.profiles.saved.length > 0 && (
                <optgroup label="Saved chats by model">
                  {state.profiles.saved.map(
                    ({ id, connection, model, available }) => (
                      <option
                        key={id}
                        value={`saved:${id}`}
                        disabled={!available}
                      >
                        {connection} · {model}
                        {available ? "" : " (unavailable)"}
                      </option>
                    )
                  )}
                </optgroup>
              )}
              {state.profiles.choices.length > 0 && (
                <optgroup label="New chat with…">
                  {state.profiles.choices.map(({ id, connection, model }) => (
                    <option key={id} value={`new:${id}`}>
                      {connection} · {model}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void controller.readProfiles()}
          >
            Refresh models
          </Button>
          {state.profileError && (
            <p role="alert" className="basis-full text-destructive">
              {state.profileError}
            </p>
          )}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <select
          aria-label="Chat"
          className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1 text-xs"
          value={state.selected ?? ""}
          disabled={state.profileBusy}
          onChange={(event) =>
            void controller.select(event.currentTarget.value || null)
          }
        >
          <option value="">New Chat</option>
          {state.selected && !state.sessions.includes(state.selected) && (
            <option value={state.selected}>
              {controller.chatTitle(state.selected)}
              {state.catalogEntry?.archived ? " (archived)" : ""}
            </option>
          )}
          {state.sessions.map((id) => (
            <option key={id} value={id}>
              {controller.chatTitle(id)}
            </option>
          ))}
        </select>
        {controller.canOrganizeChats && (
          <Button
            type="button"
            size="xs"
            variant={state.catalogArchived ? "secondary" : "ghost"}
            disabled={state.catalogLoading}
            onClick={() =>
              void controller.listChats(null, !state.catalogArchived)
            }
          >
            {state.catalogArchived ? "Active chats" : "Archived chats"}
          </Button>
        )}
        {controller.canOpenSideChat && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => controller.openSideChat()}
          >
            Side chat
          </Button>
        )}
        {controller.hasContextLimit && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Context limit"
            title="Context limit"
            disabled={state.contextLimitBusy}
            onClick={() => void controller.toggleContextLimit()}
          >
            <SlidersHorizontalIcon className="size-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void controller.select(null)}
        >
          New Chat
        </Button>
      </div>
      {controller.canOrganizeChats && state.selected && (
        <div className="flex flex-wrap items-center gap-1 px-3 pb-2 text-xs">
          {state.catalogDraft ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                void controller.saveTitle();
              }}
            >
              <Input
                aria-label="Chat title"
                autoFocus
                maxLength={256}
                value={state.catalogDraft.text}
                disabled={state.catalogChanging}
                onChange={(event) =>
                  controller.changeTitle(event.currentTarget.value)
                }
                className="h-7 text-xs md:text-xs"
              />
              <Button type="submit" size="xs" disabled={state.catalogChanging}>
                Save title
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={state.catalogChanging}
                onClick={() => controller.cancelRename()}
              >
                Cancel
              </Button>
            </form>
          ) : state.catalogEntry ? (
            <>
              {state.catalogEntry.archived && (
                <span className="text-muted-foreground">Archived</span>
              )}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={state.catalogChanging}
                onClick={() => controller.beginRename()}
              >
                Rename chat
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={state.catalogChanging}
                onClick={() =>
                  void controller.setChatArchived(!state.catalogEntry?.archived)
                }
              >
                {state.catalogEntry.archived ? "Restore chat" : "Archive chat"}
              </Button>
              {state.catalogEntry.deletionAvailable &&
                bridge.deleteSavedChat && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-destructive"
                    disabled={!controller.canDeleteSavedChat}
                    onClick={() => void controller.deleteSavedChat()}
                  >
                    Delete chat
                  </Button>
                )}
            </>
          ) : state.catalogEntryError ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => void controller.readChatDetails()}
            >
              Retry chat details
            </Button>
          ) : null}
          {state.catalogEntryError && (
            <p role="alert" className="basis-full text-destructive">
              {state.catalogEntryError}
            </p>
          )}
        </div>
      )}
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
      {state.contextLimitOpen && (
        <NativeContextLimitPanel controller={controller} state={state} />
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
              actions={
                message.role === "user" && editHistory
                  ? {
                      onEdit: (messageId) =>
                        void controller.prepareRevision(messageId),
                    }
                  : undefined
              }
              message={{
                id: message.messageId,
                role: message.role,
                parts: [{ type: "text", text: message.text }],
              }}
            />
          ))}
          {running &&
            !retrying &&
            state.messages.at(-1)?.role !== "assistant" && (
              <PendingTurnIndicator />
            )}
          {!turn &&
            !state.loading &&
            !state.repairing &&
            state.turnSummary &&
            state.turnSummary.turnId === snapshot?.latest?.turnId && (
              <NativeTurnSummary
                key={state.turnSummary.turnId}
                summary={state.turnSummary}
                messages={state.messages}
                previewController={bridge.readArtifact ? controller : undefined}
                onRetry={
                  state.turnSummary.detailsUnavailable
                    ? () => controller.retryTurnSummary()
                    : undefined
                }
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
      {queue && (
        <div className="max-h-40 shrink-0 overflow-y-auto">
          <QueuedMessageRows
            plain
            queued={queue.items.map((item) => ({
              id: item.inputId,
              text: item.goalStart
                ? `Goal: ${item.preview ?? item.goalStart.objective}`
                : `${item.operatingRegime === "plan" ? "Plan · " : item.allowsConfigurationChange ? "Settings permitted · " : ""}${item.effort === "ultra" ? "Ultra · " : ""}${item.preview ?? "Queued input with other content"}`,
            }))}
            actions={(inputId, index) => {
              const position = queue.offset + index;
              return (
                <div className="flex shrink-0 items-center gap-0.5">
                  <MessageAction
                    tooltip="Edit queued message"
                    disabled={
                      queueDisabled ||
                      !!state.queueDraft ||
                      !!queue.items[index].goalStart ||
                      !!queue.items[index].allowsConfigurationChange ||
                      !bridge.queuedText ||
                      !bridge.editQueue ||
                      queue.items[index].preview === null
                    }
                    onClick={() => void controller.editQueuedText(inputId)}
                  >
                    <PencilIcon />
                  </MessageAction>
                  <MessageAction
                    tooltip="Move queued message up"
                    disabled={
                      queueDisabled || !bridge.editQueue || position === 0
                    }
                    onClick={() =>
                      void controller.editQueue({
                        action: "move",
                        inputId,
                        direction: "up",
                      })
                    }
                  >
                    <ArrowUpIcon />
                  </MessageAction>
                  <MessageAction
                    tooltip="Move queued message down"
                    disabled={
                      queueDisabled ||
                      !bridge.editQueue ||
                      position + 1 >= queued
                    }
                    onClick={() =>
                      void controller.editQueue({
                        action: "move",
                        inputId,
                        direction: "down",
                      })
                    }
                  >
                    <ArrowDownIcon />
                  </MessageAction>
                  <MessageAction
                    tooltip="Remove from queue"
                    disabled={queueDisabled || !bridge.editQueue}
                    onClick={() =>
                      void controller.editQueue({ action: "withdraw", inputId })
                    }
                  >
                    <XIcon />
                  </MessageAction>
                </div>
              );
            }}
          />
          {(previousQueueOffset !== null || nextQueueOffset !== null) && (
            <div className="flex gap-2 px-3 pb-2">
              {previousQueueOffset !== null && (
                <Button
                  size="xs"
                  variant="ghost"
                  type="button"
                  disabled={state.queueLoading || state.acting}
                  onClick={() =>
                    void controller.showQueuePage(previousQueueOffset)
                  }
                >
                  Previous queued messages
                </Button>
              )}
              {nextQueueOffset !== null && (
                <Button
                  size="xs"
                  variant="ghost"
                  type="button"
                  disabled={state.queueLoading || state.acting}
                  onClick={() => void controller.showQueuePage(nextQueueOffset)}
                >
                  Next queued messages
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {state.queueDraft && (
        <div className="shrink-0 space-y-2 px-3 py-2">
          <Textarea
            aria-label="Edit queued message"
            value={state.queueDraft.text}
            disabled={state.acting}
            onChange={(event) =>
              controller.changeQueueDraft(event.currentTarget.value)
            }
          />
          <div className="flex justify-end gap-2">
            <Button
              size="xs"
              variant="ghost"
              type="button"
              disabled={state.acting}
              onClick={() => controller.closeQueueDraft()}
            >
              Cancel edit
            </Button>
            <Button
              size="xs"
              type="button"
              disabled={state.acting || !state.queueDraft.text.trim()}
              onClick={() => void controller.saveQueueDraft()}
            >
              Save changes
            </Button>
          </div>
        </div>
      )}
      {snapshot?.admissionPaused && !turn && bridge.editQueue && (
        <div className="px-3 py-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={state.acting}
            onClick={() => void controller.editQueue({ action: "resume" })}
          >
            Resume queue
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
      {bridge.goal && bridge.startGoal && (
        <NativeGoalPanel
          key={state.scope}
          controller={controller}
          view={state}
        />
      )}
      {state.subagents && (
        <NativeSubagentsPanel key={state.scope} controller={state.subagents} />
      )}
      <div className="shrink-0 p-3">
        {state.wakeupsAvailable &&
          (controller.canAllowWakeup || state.allowWakeup) && (
            <label className="mb-1 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={state.allowWakeup}
                disabled={state.acting}
                onChange={(event) =>
                  controller.setAllowWakeup(event.currentTarget.checked)
                }
              />
              Allow one scheduled check-in
            </label>
          )}
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
              if (file) void controller.pickPng(state.scope, file);
            }}
          />
        )}
        {(state.imageDraft || state.imageReading) && (
          <div className="flex items-center gap-2 px-1 pb-1 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {state.imageReading ? "Reading PNG…" : state.imageDraft?.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={state.acting}
              onClick={() => controller.removePng(state.scope)}
            >
              Remove PNG
            </Button>
          </div>
        )}
        {state.imageDraft && (state.imageDraft.error || !state.imageInput) && (
          <p role="status" className="text-muted-foreground px-1 pb-1 text-xs">
            {state.imageDraft.error ??
              "This connection cannot use the attached PNG. Remove it from this draft or use a compatible connection."}
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
        <AgentComposerInput
          key={state.scope}
          catalog={TEXT_CATALOG}
          commandActions={state.commands.map(
            (command): ComposerCommandAction => ({
              id: command,
              title: command,
              description: COMMAND_DESCRIPTIONS[command],
              standalone: true,
              run: () => controller.runCommand(command),
            })
          )}
          attach={false}
          operableFiles={false}
          awaitSubmission
          canSubmit={controller.canSubmit}
          busy={!!turn}
          isStreaming={streamingControlsOnly}
          placeholder={
            state.imageDraft
              ? "Add a message to send this PNG…"
              : state.steering
                ? "Add guidance to this turn…"
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
              {state.imageInput && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!controller.canAttachPng}
                  onClick={() => pngPicker.current?.click()}
                >
                  {state.imageDraft ? "Replace PNG" : "Add PNG"}
                </Button>
              )}
              {bridge.submitInRegime && !state.steering && (
                <select
                  aria-label="Mode for next message"
                  className="rounded-md bg-transparent px-1.5 text-xs"
                  value={state.operatingRegime}
                  disabled={state.acting}
                  onChange={(event) =>
                    controller.selectOperatingRegime(
                      event.currentTarget.value === "plan" ? "plan" : "act"
                    )
                  }
                >
                  <option value="act">Act</option>
                  <option value="plan">Plan</option>
                </select>
              )}
              {state.effortAvailable &&
                !state.steering &&
                !state.revisionDraft && (
                  <select
                    aria-label="Effort for next message"
                    title="Effort for next message"
                    className="rounded-md bg-transparent px-1.5 text-xs"
                    value={state.effort}
                    disabled={state.acting}
                    onChange={(event) =>
                      controller.selectEffort(
                        event.currentTarget.value === "ultra"
                          ? "ultra"
                          : "standard"
                      )
                    }
                  >
                    <option value="standard">Standard</option>
                    <option value="ultra">Ultra</option>
                  </select>
                )}
              {(running || waitingForCheckIn) && !goalTurn ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={state.acting}
                  onClick={() => void controller.control("pause")}
                >
                  Pause
                </Button>
              ) : (canResume && (!goalTurn || !state.goal?.goal?.paused)) ||
                canContinue ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={state.acting}
                  onClick={() => void controller.control("resume")}
                >
                  {canContinue ? "Continue" : "Resume"}
                </Button>
              ) : null}
              {(controller.canSteer || state.steering) && (
                <Button
                  type="button"
                  size="xs"
                  variant={state.steering ? "secondary" : "ghost"}
                  disabled={state.acting}
                  onClick={() => controller.toggleSteering()}
                >
                  {state.steering ? "Send a follow-up" : "Send to current turn"}
                </Button>
              )}
            </>
          }
          toolbarEnd={
            !streamingControlsOnly && canStop ? (
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

function reviewText(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}
