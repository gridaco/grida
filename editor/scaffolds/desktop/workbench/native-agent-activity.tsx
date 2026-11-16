"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowLeftIcon,
  BotIcon,
  RefreshCwIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";
import { NativeBackgroundProcessList } from "./native-background-processes";
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

/** A parent-local activity view; the underlying parent and its draft stay mounted. */
export function NativeAgentActivity({
  subagents,
  processes,
  onOpenChange,
}: {
  subagents: NativeSubagentController | null;
  processes: NativeBackgroundProcessController | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const view = useSyncExternalStore(
    subagents?.subscribe ?? subscribeEmpty,
    subagents?.read ?? readEmpty,
    subagents?.read ?? readEmpty
  );
  const [processOpen, setProcessOpen] = useState(false);
  const [tab, setTab] = useState<"subagents" | "processes">(
    subagents ? "subagents" : "processes"
  );
  const open = !!(subagents || processes) && (view.open || processOpen);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    onOpenChange?.(open);
    if (open) panel.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open, onOpenChange]);
  if (!subagents && !processes) return null;
  const shown =
    subagents && view.detail
      ? "subagents"
      : tab === "processes" && processes
        ? "processes"
        : subagents
          ? "subagents"
          : "processes";
  const close = () => {
    if (view.open) subagents?.toggle();
    setProcessOpen(false);
  };
  const choose = (next: "subagents" | "processes") => {
    setTab(next);
    if (subagents) {
      subagents.back();
      subagents.show();
    } else setProcessOpen(true);
  };
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2 z-10 shrink-0"
        ref={trigger}
        tabIndex={open ? -1 : 0}
        aria-label="Open agent activity"
        title="Agent activity"
        onClick={() => (open ? close() : choose(shown))}
      >
        <BotIcon className="size-3.5" />
      </Button>
      {open && (
        <section
          data-testid="native-agent-activity"
          aria-label="Agent activity"
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
          <header className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
            {subagents && (
              <Button
                type="button"
                variant={shown === "subagents" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => choose("subagents")}
              >
                <BotIcon className="size-3.5" />
                Subagents
              </Button>
            )}
            {processes && (
              <Button
                type="button"
                variant={shown === "processes" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => choose("processes")}
              >
                <TerminalIcon className="size-3.5" />
                Processes
              </Button>
            )}
            <span className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close agent activity"
              onClick={close}
            >
              <XIcon className="size-3.5" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {shown === "processes" && processes ? (
              <NativeBackgroundProcessList controller={processes} />
            ) : subagents ? (
              <NativeSubagentActivity
                controller={subagents}
                onBack={() => {
                  setTab("subagents");
                  subagents.back();
                }}
              />
            ) : null}
          </div>
        </section>
      )}
    </>
  );
}

export function NativeSubagentActivity({
  controller,
  onBack = () => controller.back(),
}: {
  controller: NativeSubagentController;
  onBack?: () => void;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const child = view.observation?.child;
  return (
    <div data-testid="native-subagent-activity" className="flex flex-col gap-4">
      {view.detail && view.selected ? (
        <>
          <header className="flex min-w-0 items-center gap-2">
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
                    settled results. A live conversation is unavailable on this
                    host.
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
              <NativeSubagentControls
                key={view.selected}
                controller={controller}
              />
            </>
          ) : !view.activityAvailable ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading subagent…
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Subagents</h2>
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
          <NativeSubagentCreate controller={controller} />
        </>
      )}
      {view.error && (
        <p role="alert" className="text-xs text-destructive">
          {view.error}
        </p>
      )}
      {view.activityError && (
        <p role="alert" className="text-xs text-destructive">
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
  const renderMessage = (message: NativeChatMessage) => (
    <ChatMessageView
      key={message.messageId}
      actions={{ hidden: true }}
      message={{
        id: message.messageId,
        role: message.role,
        parts: native_message_parts.of(message),
      }}
    />
  );
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
            {record && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <time dateTime={new Date(record.startedAtMs).toISOString()}>
                  {new Date(record.startedAtMs).toLocaleString()}
                </time>
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

function NativeSubagentCreate({
  controller,
}: {
  controller: NativeSubagentController;
}) {
  const [name, setName] = useState("");
  const [allowance, setAllowance] = useState(2);
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  return (
    <details className="rounded-xl border p-3">
      <summary className="cursor-pointer text-xs font-medium">
        New named subagent
      </summary>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.create(name, allowance);
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          Name
          <input
            className="rounded-md border bg-transparent px-2 py-1.5"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={128}
            required
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          Assignment allowance
          <input
            className="w-16 rounded-md border bg-transparent px-2 py-1.5"
            type="number"
            value={allowance}
            onChange={(event) => setAllowance(event.target.valueAsNumber)}
            min={1}
            max={8}
            required
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Named assignments are text-only and do not inherit project tools.
        </p>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={view.acting}
        >
          Create subagent
        </Button>
      </form>
    </details>
  );
}

function NativeSubagentControls({
  controller,
}: {
  controller: NativeSubagentController;
}) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  const [instructions, setInstructions] = useState("");
  const [message, setMessage] = useState("");
  const controls = controller.turnControls;
  const childControls = controller.childControls;
  return (
    <section className="space-y-3 border-t pt-3" aria-label="Subagent controls">
      <div className="flex flex-wrap gap-2">
        {view.observation?.stopObservationId && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={view.acting}
            onClick={() => void controller.stop()}
          >
            Stop subagent
          </Button>
        )}
        {controls
          .filter((kind) => kind !== "steer")
          .map((kind) => (
            <Button
              key={kind}
              type="button"
              size="xs"
              variant="outline"
              disabled={view.acting}
              onClick={() => void controller.controlTurn({ kind })}
            >
              {kind === "pause" ? "Pause subagent" : "Resume subagent"}
            </Button>
          ))}
        {controller.canRetryTurnControl && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={view.acting}
            onClick={() => void controller.retryTurnControl()}
          >
            Retry subagent control
          </Button>
        )}
        {controller.retryableChildControl && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={view.acting}
            onClick={() => void controller.retryChildControl()}
          >
            Retry subagent action
          </Button>
        )}
        {childControls.includes("resume-queue") && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={view.acting}
            onClick={() =>
              void controller.controlChild({ kind: "resume-queue" })
            }
          >
            Resume waiting assignments
          </Button>
        )}
      </div>
      {!!view.observation?.child.queuedInputIds.length && (
        <label className="flex flex-col gap-1 text-xs">
          Waiting assignment
          <select
            className="rounded-md border bg-background px-2 py-1.5"
            value={view.input ?? ""}
            onChange={(event) =>
              void controller.select(view.selected!, event.target.value || null)
            }
          >
            <option value="">Latest assignment</option>
            {view.observation.child.queuedInputIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}
      {childControls.includes("withdraw") && view.input && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={view.acting}
          onClick={() =>
            void controller.controlChild({
              kind: "withdraw",
              inputId: view.input!,
            })
          }
        >
          Withdraw selected assignment
        </Button>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.assign(instructions);
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          Assignment or steering instructions
          <textarea
            className="min-h-20 rounded-xl border bg-transparent p-2 text-sm"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={64 * 1024}
          />
        </label>
        <div className="flex gap-2">
          <Button
            type="submit"
            size="xs"
            variant="secondary"
            disabled={
              view.acting || !controller.canAssign || !instructions.trim()
            }
          >
            Assign work
          </Button>
          {controls.includes("steer") && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={view.acting || !instructions.trim()}
              onClick={() =>
                void controller.controlTurn({ kind: "steer", instructions })
              }
            >
              Steer subagent
            </Button>
          )}
        </div>
        {!controller.canAssign && (
          <p className="text-xs text-muted-foreground">
            A new assignment needs a finished Act turn and remaining allowance.
          </p>
        )}
      </form>
      {childControls.includes("message") && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void controller.controlChild({ kind: "message", text: message });
          }}
        >
          <label className="flex flex-col gap-1 text-xs">
            Information for subagent
            <textarea
              className="min-h-16 rounded-xl border bg-transparent p-2 text-sm"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4096}
            />
          </label>
          <Button
            type="submit"
            size="xs"
            variant="outline"
            disabled={view.acting || !message.trim()}
          >
            Send information
          </Button>
          <p className="text-xs text-muted-foreground">
            Information does not start an idle subagent.
          </p>
        </form>
      )}
    </section>
  );
}
