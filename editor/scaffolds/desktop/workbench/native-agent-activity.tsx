"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ArrowLeftIcon, BotIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@app/ui/ai-elements/conversation";
import { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";
import { NativeSubagentIdentity } from "./native-subagent-identity";
import type {
  NativeSubagentConversation,
  NativeSubagentExecution,
  NativeSubagentSummary,
  NativeChatMessage,
} from "@grida/desktop-bridge";
import { ChatMessageView, CompactionNotice } from "@/kits/agent-chat";
import { NativeTurnActivity } from "./native-turn-activity";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { native_message_parts } from "@/lib/agent-chat/native-message-parts";

const EMPTY = Object.freeze({
  open: false,
  focus: 0,
  detail: false,
  children: [],
  next: null,
  selected: null,
  input: null,
  observation: null,
  activityAvailable: false,
  activity: null,
  activityError: null,
  summaries: [],
  events: [],
  eventsComplete: true,
  conversation: null,
  conversationLoading: false,
  conversationError: null,
  historyLimited: false,
  listLimited: false,
  listing: false,
  acting: false,
  error: null,
}) satisfies ReturnType<NativeSubagentController["read"]>;
const readEmpty = () => EMPTY;
const subscribeEmpty = () => () => {};

/** A parent-local subagent viewer; the parent and its draft stay mounted. */
export function NativeSubagentActivityPanel({
  subagents,
}: {
  subagents: NativeSubagentController | null;
}) {
  const view = useSyncExternalStore(
    subagents?.subscribe ?? subscribeEmpty,
    subagents?.read ?? readEmpty,
    subagents?.read ?? readEmpty
  );
  const open = !!subagents && view.open;
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      panel.current?.focus();
    } else if (!open && wasOpen.current && returnFocus.current?.isConnected) {
      returnFocus.current.focus();
    }
    wasOpen.current = open;
  }, [open]);
  if (!subagents) return null;
  const close = () => subagents.toggle();
  return (
    <>
      {open && (
        <section
          data-testid="native-agent-activity"
          aria-label="Subagents"
          ref={panel}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
          className="absolute inset-0 z-20 flex min-h-0 flex-col bg-background"
        >
          <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <BotIcon className="size-3.5" />
            <h2 className="flex-1 text-xs font-medium">Subagents</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close subagents"
              onClick={close}
            >
              <XIcon className="size-3.5" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden py-3">
            <NativeSubagentActivity
              controller={subagents}
              onBack={() => {
                subagents.back();
                panel.current?.focus();
              }}
            />
          </div>
        </section>
      )}
    </>
  );
}

/** Read-only child activity; assignments and execution stay with the parent agent. */
export function NativeSubagentActivity({
  controller,
  onBack = () => controller.back(),
  heading = true,
}: {
  controller: NativeSubagentController;
  onBack?: () => void;
  heading?: boolean;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const child = view.observation?.child;
  return (
    <div
      data-testid="native-subagent-activity"
      className={`flex h-full min-h-0 flex-col gap-4 ${view.detail && view.selected ? "overflow-hidden" : "overflow-y-auto"}`}
    >
      {view.detail && view.selected ? (
        <>
          <header className="flex min-w-0 shrink-0 items-center gap-2 px-4">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Back to subagents"
              onClick={onBack}
            >
              <ArrowLeftIcon className="size-4" />
            </Button>
            <NativeSubagentIdentity childId={view.selected} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-medium">
                {child?.name ??
                  view.children.find((entry) => entry.childId === view.selected)
                    ?.name ??
                  "Subagent"}
              </h2>
              <p
                className="truncate text-xs text-muted-foreground"
                title={view.selected}
              >
                {view.selected}
              </p>
            </div>
            {view.conversation?.execution && (
              <p className="max-w-[45%] text-right text-xs text-muted-foreground">
                {executionLabel(view.conversation.execution)}
              </p>
            )}
          </header>
          <Conversation
            key={view.selected}
            className="min-h-0 flex-1"
            initial="instant"
            resize={child?.current ? "smooth" : "instant"}
          >
            <ConversationContent
              scrollbar="custom"
              className="gap-4 p-0 px-[max(1rem,calc((100%_-_48rem)/2))] pb-4"
            >
              {view.activityAvailable && (
                <NativeSubagentConversationView controller={controller} />
              )}
              {child ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {child.current
                        ? child.current.paused
                          ? "Paused"
                          : child.current.disposition
                        : child.queuedInputIds.length
                          ? "Queued"
                          : "Idle"}
                    </span>
                    <span>
                      {child.reserved} of {child.workTurns} assignments used
                    </span>
                    {!!child.queuedInputIds.length && (
                      <span>{child.queuedInputIds.length} waiting</span>
                    )}
                  </div>
                  {!view.activityAvailable && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        This Desktop connection exposes assignment previews and
                        settled results. A live conversation is unavailable on
                        this host.
                      </p>
                      {child.assignment && (
                        <section className="space-y-2 rounded-xl border p-3">
                          <h3 className="text-xs font-medium">
                            Assignment preview
                          </h3>
                          <p className="whitespace-pre-wrap text-sm">
                            {child.assignment.instructionPreview}
                          </p>
                          {child.assignment.instructionTruncated && (
                            <p className="text-xs text-muted-foreground">
                              Instructions shortened.
                            </p>
                          )}
                          {child.assignment.result && (
                            <>
                              <h3 className="pt-2 text-xs font-medium">
                                Result · {child.assignment.result.status}
                              </h3>
                              <p className="whitespace-pre-wrap text-sm">
                                {child.assignment.result.text}
                              </p>
                              {child.assignment.result.textTruncated && (
                                <p className="text-xs text-muted-foreground">
                                  Result shortened.
                                </p>
                              )}
                            </>
                          )}
                        </section>
                      )}
                    </>
                  )}
                </>
              ) : !view.activityAvailable ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading subagent…
                </p>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton aria-label="Scroll to bottom" />
          </Conversation>
        </>
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4">
          <div className="flex items-center justify-end gap-2">
            {heading && (
              <h2 className="mr-auto text-sm font-medium">Subagents</h2>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Refresh subagents"
              disabled={view.listing}
              onClick={() => controller.restartList()}
            >
              <RefreshCwIcon className="size-3.5" />
            </Button>
          </div>
          {view.activityAvailable ? (
            <NativeSubagentSections controller={controller} />
          ) : (
            <>
              {!view.listing && view.children.length === 0 && (
                <p className="py-5 text-sm text-muted-foreground">
                  No subagents yet.
                </p>
              )}
              <ul className="space-y-1">
                {view.children.map((entry) => (
                  <li key={entry.childId}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-muted"
                      onClick={() => void controller.openChild(entry.childId)}
                    >
                      <NativeSubagentIdentity childId={entry.childId} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {entry.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {view.listing && (
            <p role="status" className="text-xs text-muted-foreground">
              Loading subagents…
            </p>
          )}
          {!view.activityAvailable && view.next && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={view.listing}
              onClick={() => void controller.list(true)}
            >
              Show more
            </Button>
          )}
        </div>
      )}
      {view.error && (
        <p role="alert" className="px-4 text-xs text-destructive">
          {view.error}
        </p>
      )}
      {view.activityError && (
        <p role="alert" className="px-4 text-xs text-destructive">
          {view.activityError}
        </p>
      )}
    </div>
  );
}

function NativeSubagentSections({
  controller,
}: {
  controller: NativeSubagentController;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const activity = view.activity;
  if (!activity)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading subagent activity…
      </p>
    );
  const byRecent = (a: NativeSubagentSummary, b: NativeSubagentSummary) =>
    (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0) ||
    a.childId.localeCompare(b.childId);
  const active = view.summaries
    .filter((child) => child.section === "active")
    .sort(byRecent);
  const done = view.summaries
    .filter((child) => child.section === "done")
    .sort(byRecent);
  const countsUpdating =
    active.length > activity.counts.active ||
    done.length > activity.counts.done;
  const activeCount = Math.max(active.length, activity.counts.active);
  const doneCount = Math.max(done.length, activity.counts.done);
  const exact = activity.counts.complete && !countsUpdating;
  const moreInActive =
    !active.length &&
    !!view.next &&
    (activity.counts.active > 0 || !activity.counts.complete);
  const more = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={view.listing}
      onClick={() => void controller.list(true)}
    >
      Show more subagents
    </Button>
  );
  const row = (child: NativeSubagentSummary) => (
    <li key={child.childId}>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-muted"
        onClick={() => void controller.openChild(child.childId)}
      >
        <NativeSubagentIdentity childId={child.childId} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{child.name}</span>
          <span className="text-xs text-muted-foreground">
            {statusLabel(child.status)}
            {child.kind === "review" ? " · Independent review" : ""}
          </span>
        </span>
        {child.updatedAtMs !== undefined && (
          <time
            className="shrink-0 text-xs text-muted-foreground"
            dateTime={new Date(child.updatedAtMs).toISOString()}
            title={new Date(child.updatedAtMs).toLocaleString()}
          >
            {relativeTime(child.updatedAtMs, activity.observedAtMs)}
          </time>
        )}
      </button>
    </li>
  );
  return (
    <>
      <section aria-label="Active subagents" className="space-y-2">
        <h3 className="text-xs text-muted-foreground">
          Active · {exact ? "" : "≥"}
          {activeCount}
        </h3>
        {!active.length && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {exact && activeCount === 0
              ? "No active subagents."
              : "More active subagents may be on later pages."}
          </p>
        )}
        <ul>{active.map(row)}</ul>
        {moreInActive && more}
      </section>
      <section aria-label="Completed subagents" className="space-y-2">
        <h3 className="text-xs text-muted-foreground">
          Done · {exact ? "" : "≥"}
          {doneCount}
        </h3>
        {!done.length && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {exact && doneCount === 0
              ? "No completed subagents."
              : "Completed subagents may be on later pages."}
          </p>
        )}
        <ul>{done.map(row)}</ul>
      </section>
      {view.next && !moreInActive && more}
      {view.listLimited && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            Some subagents between the newest and older pages are outside this
            view's browse window.
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => controller.restartList()}
          >
            Newest subagents
          </Button>
        </div>
      )}
      {countsUpdating && (
        <p className="text-xs text-muted-foreground">
          Updating totals… Counts currently show at least the loaded work.
        </p>
      )}
      {(view.next || !activity.counts.complete) && (
        <p className="text-xs text-muted-foreground">
          Showing loaded subagents. Pages follow creation order; loaded rows are
          sorted by their last recorded work. Counts with ≥ are lower bounds.
        </p>
      )}
    </>
  );
}

function NativeSubagentConversationView({
  controller,
}: {
  controller: NativeSubagentController;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const conversation = view.conversation;
  return (
    <section data-testid="native-subagent-conversation" className="space-y-4">
      {conversation?.older && !view.historyLimited && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={view.conversationLoading}
          onClick={() => void controller.readConversation(true)}
        >
          Load earlier messages
        </Button>
      )}
      {view.conversationLoading && !conversation && (
        <p role="status" className="text-sm text-muted-foreground">
          Reading conversation…
        </p>
      )}
      {conversation && (
        <>
          {view.observation?.child.current && !conversation.live.available && (
            <p className="text-xs text-muted-foreground">
              Live text is unavailable for this run. Retained messages and the
              final result remain available.
            </p>
          )}
          {(conversation.live.truncated ||
            conversation.messages.some((message) => message.truncated)) && (
            <p className="text-xs text-muted-foreground">
              Some conversation content was shortened by the host.
            </p>
          )}
          {view.historyLimited && (
            <p className="text-xs text-muted-foreground">
              Earlier history in this view is limited. Reopen the subagent to
              start from its latest work.
            </p>
          )}
          {conversation.messages.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No conversation messages yet.
            </p>
          ) : (
            <NativeChildTranscript
              conversation={conversation}
              currentTurnId={view.observation?.child.current?.turnId}
            />
          )}
        </>
      )}
      {view.conversationError && (
        <div role="alert" className="space-y-2 text-xs text-destructive">
          <p>{view.conversationError}</p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={view.conversationLoading}
            onClick={() => void controller.readConversation()}
          >
            Retry conversation
          </Button>
        </div>
      )}
    </section>
  );
}

/** Uses the ordinary transcript presentation on child-scoped, read-only DTOs. */
function NativeChildTranscript({
  conversation,
  currentTurnId,
}: {
  conversation: NativeSubagentConversation;
  currentTurnId?: string;
}) {
  const current = currentTurnId ? { turnId: currentTurnId } : null;
  const blocks = turn_activity.group(
    conversation.messages,
    conversation.turns,
    current
  );
  const records = new Map(
    conversation.turns.map((turn) => [turn.turnId, turn])
  );
  const finalAnswer = new Map<string, string>();
  for (const message of conversation.messages)
    if (message.role === "assistant" && message.turnId)
      finalAnswer.set(message.turnId, message.messageId);
  const renderMessage = (message: NativeChatMessage) => {
    const record = message.turnId ? records.get(message.turnId) : undefined;
    return (
      <ChatMessageView
        key={message.messageId}
        actions={
          message.role === "user"
            ? { sentAtMs: record?.startedAtMs }
            : message.turnId &&
                (finalAnswer.get(message.turnId) !== message.messageId ||
                  record?.settledAtMs === undefined)
              ? { hidden: true }
              : { sentAtMs: record?.settledAtMs }
        }
        message={{
          id: message.messageId,
          role: message.role,
          parts: native_message_parts.of(message),
        }}
      />
    );
  };
  return (
    <div className="space-y-5">
      {blocks.map((block) => {
        if (block.kind === "message") return renderMessage(block.message);
        if (block.kind === "compaction")
          return (
            <CompactionNotice
              key={block.turnId}
              summary={block.summary}
              auto={block.automatic}
            />
          );
        const record = records.get(block.turnId);
        return (
          <section
            key={block.turnId}
            className="space-y-3"
            aria-label="Subagent turn"
          >
            {record &&
              (record.execution.model !== conversation.execution?.model ||
                record.execution.effort !== conversation.execution?.effort) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>{executionLabel(record.execution)}</span>
                </div>
              )}
            <NativeTurnActivity block={block} renderMessage={renderMessage} />
          </section>
        );
      })}
    </div>
  );
}

function executionLabel(execution: NativeSubagentExecution): string {
  const effort = execution.effort
    ? execution.effort.charAt(0).toUpperCase() + execution.effort.slice(1)
    : "Model default effort";
  return `${execution.model ?? "Model unavailable"} · ${effort}`;
}

function statusLabel(status: NativeSubagentSummary["status"]): string {
  return {
    ready: "Ready",
    queued: "Queued",
    running: "Working",
    paused: "Paused",
    interrupted: "Interrupted",
    succeeded: "Finished",
    failed: "Failed",
    cancelled: "Stopped",
    uncertain: "Result uncertain",
  }[status];
}

function relativeTime(atMs: number, nowMs: number): string {
  const seconds = Math.floor(Math.max(0, nowMs - atMs) / 1_000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
