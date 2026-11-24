"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  NativeChatGoal,
  NativeChatQueueItem,
  NativeChatQueuePage,
} from "@grida/desktop-bridge";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@app/ui/lib/utils";
import { Button } from "@app/ui/components/button";
import { Textarea } from "@app/ui/components/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CornerDownRightIcon,
  EllipsisIcon,
  GoalIcon,
  GripVerticalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import type {
  NativeChatController,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";
import { NativeQueuedMessagePreview } from "./native-queued-message-preview";

const EMPTY_QUEUE: NativeChatQueuePage = {
  items: [],
  offset: 0,
  previousOffset: null,
  nextOffset: null,
};

/**
 * The stack attached above the composer: a held-queue notice, waiting
 * messages, then the chat's goal. Each row offers only its direct actions.
 */
export function NativeComposerTray({
  controller,
  view,
  prepareQueueRemoval,
  renderOutgoingStatus,
}: {
  controller: NativeChatController;
  view: NativeChatView;
  renderOutgoingStatus: (item: NativeChatView["outgoing"][number]) => ReactNode;
  prepareQueueRemoval?: (inputId: string) => (() => void) | undefined;
}) {
  const queue = view.queue;
  const goal = view.goal?.goal;
  const pendingGoal = !!view.observation?.snapshot.pendingGoalId;
  const showGoal = pendingGoal || (!!goal && goal.state.status !== "cleared");
  const items = queue?.items ?? [];
  const hidden =
    view.queueDraft?.checkoutId || view.queueDraft?.fromKeyboard
      ? view.queueDraft.inputId
      : undefined;
  const outgoing = view.outgoing.filter(
    (item) => item.placement === "queue" && item.id !== hidden
  );
  const count = view.observation?.snapshot.queuedInputs ?? items.length;
  // An interrupted turn pauses the queue. An idle queue can also wait with
  // nothing paused (after a restart); a goal that is starting is its own row.
  const interrupted = !!view.observation?.snapshot.admissionPaused;
  const held =
    count > 0 && controller.canResumeQueue && (interrupted || !pendingGoal);
  const showQueue =
    items.some((item) => item.inputId !== hidden) ||
    outgoing.length > 0 ||
    (!!queue && (queue.previousOffset !== null || queue.nextOffset !== null));
  const loadingRows = count > 0 && !items.length && !outgoing.length && !held;
  if (!showQueue && !loadingRows && !held && !showGoal) return null;
  return (
    <div
      data-testid="workspace-composer-tray"
      className="mx-2 divide-y overflow-hidden rounded-t-xl border border-b-0 bg-background text-sm"
    >
      {held && (
        <div className="flex items-center gap-2 py-1 pr-1.5 pl-3">
          <PauseIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="text-muted-foreground min-w-0 flex-1 truncate">
            {interrupted
              ? "Queue paused because you interrupted"
              : "Queued messages are waiting"}
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground shrink-0"
            disabled={view.acting}
            onClick={() => void controller.editQueue({ action: "resume" })}
          >
            <PlayIcon className="size-3.5" />
            Resume
          </Button>
        </div>
      )}
      {loadingRows && (
        <p role="status" className="text-muted-foreground px-3 py-2">
          {count === 1 ? "1 queued message" : `${count} queued messages`}
        </p>
      )}
      {showQueue && (
        <NativeComposerQueue
          controller={controller}
          view={view}
          queue={queue ?? EMPTY_QUEUE}
          count={count}
          prepareQueueRemoval={prepareQueueRemoval}
        >
          {outgoing.map((item) => (
            <div
              key={item.id}
              className="flex min-h-8 flex-wrap items-center gap-2 py-1 pr-1.5 pl-3"
            >
              <NativeQueuedMessagePreview
                inputId={item.id}
                preview={item.text || null}
                label={
                  item.text ||
                  item.attachments?.map(({ name }) => name).join(", ") ||
                  item.attachment?.name ||
                  "Queued message"
                }
                attachments={
                  item.attachments ??
                  (item.attachment ? [item.attachment] : undefined)
                }
                displayParts={item.displayParts}
              />
              {renderOutgoingStatus(item)}
            </div>
          ))}
        </NativeComposerQueue>
      )}
      {showGoal && (
        <GoalStrip controller={controller} view={view} goal={goal ?? null} />
      )}
    </div>
  );
}

/** Production queued rows and drag behavior, also usable with a local UI fixture. */
export function NativeComposerQueue({
  controller,
  view,
  queue,
  count,
  prepareQueueRemoval,
  children,
}: NativeComposerQueue.Props) {
  const ids = queue.items.map((item) => item.inputId);
  // Show a drop immediately; the next queue page replaces it.
  const [order, setOrder] = useState<{
    basis: readonly string[];
    ids: string[];
  } | null>(null);
  const authoritativeOrder = ids.join("\n");
  useEffect(() => {
    // Once the host acknowledges or replaces the page, that optimistic order
    // is retired. A later return to its old basis must not revive a stale drag.
    if (order && order.basis.join("\n") !== authoritativeOrder) setOrder(null);
  }, [order, authoritativeOrder]);
  const shown =
    order && order.basis.join("\n") === authoritativeOrder ? order.ids : ids;
  const visible =
    view.queueDraft?.checkoutId || view.queueDraft?.fromKeyboard
      ? shown.filter((id) => id !== view.queueDraft?.inputId)
      : shown;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const locked = view.acting || !controller.queueCurrent;
  const drop = ({ active, over }: DragEndEvent) => {
    if (
      locked ||
      !over ||
      active.id === over.id ||
      String(active.id) === view.queueDraft?.inputId
    )
      return;
    const from = shown.indexOf(String(active.id));
    const to = shown.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setOrder({ basis: ids, ids: arrayMove(shown, from, to) });
    void controller.editQueue({
      action: "place",
      inputId: String(active.id),
      index: queue.offset + to,
    });
  };
  return (
    <div
      data-testid="native-composer-queue"
      className="max-h-48 overflow-y-auto"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={drop}
      >
        <SortableContext items={visible} strategy={verticalListSortingStrategy}>
          {visible.map((inputId) => {
            const item = queue.items.find((row) => row.inputId === inputId)!;
            return (
              <QueueRow
                key={inputId}
                controller={controller}
                view={view}
                item={item}
                position={queue.offset + shown.indexOf(inputId)}
                queued={count}
                sortable={
                  !locked &&
                  visible.length > 1 &&
                  view.queueDraft?.inputId !== inputId
                }
                prepareQueueRemoval={prepareQueueRemoval}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      {children}
      {(queue.previousOffset !== null || queue.nextOffset !== null) && (
        <div className="flex gap-1 px-2 py-1">
          {queue.previousOffset !== null && (
            <Button
              size="xs"
              variant="ghost"
              type="button"
              disabled={view.queueLoading || view.acting}
              onClick={() =>
                void controller.showQueuePage(queue.previousOffset!)
              }
            >
              Earlier in queue
            </Button>
          )}
          {queue.nextOffset !== null && (
            <Button
              size="xs"
              variant="ghost"
              type="button"
              disabled={view.queueLoading || view.acting}
              onClick={() => void controller.showQueuePage(queue.nextOffset!)}
            >
              Later in queue
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export namespace NativeComposerQueue {
  export type Controller = Pick<
    NativeChatController,
    | "queueCurrent"
    | "editQueue"
    | "showQueuePage"
    | "readQueuedText"
    | "readQueuedAttachmentPreview"
    | "canSteerQueued"
    | "steerQueued"
    | "editQueuedText"
    | "canEditQueuedText"
  >;
  export type View = Pick<
    NativeChatView,
    "acting" | "queueDraft" | "queueLoading"
  >;
  export type Props = Readonly<{
    children?: ReactNode;
    controller: Controller;
    view: View;
    queue: NativeChatQueuePage;
    /** Size of the entire queue, including rows on other pages. */
    count: number;
    prepareQueueRemoval?: (inputId: string) => (() => void) | undefined;
  }>;
}

function QueueRow({
  controller,
  view,
  item,
  position,
  queued,
  sortable,
  prepareQueueRemoval,
}: {
  controller: NativeComposerQueue.Controller;
  view: NativeComposerQueue.View;
  item: NativeChatQueueItem;
  position: number;
  queued: number;
  sortable: boolean;
  prepareQueueRemoval?: (inputId: string) => (() => void) | undefined;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.inputId, disabled: !sortable });
  const locked = view.acting || !controller.queueCurrent;
  const editing = view.queueDraft?.inputId === item.inputId;
  const rowLocked = locked || editing;
  const summary =
    item.preview ||
    item.attachments?.map((entry) => entry.name).join(", ") ||
    "Queued message";
  const label = item.goalStart
    ? `Goal: ${item.preview ?? item.goalStart.objective}`
    : `${item.operatingRegime === "plan" ? "Plan · " : ""}${item.effort === "ultra" ? "Ultra · " : ""}${summary}`;
  const editable =
    !locked && !view.queueDraft && controller.canEditQueuedText(item);
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      aria-current={editing ? "true" : undefined}
      className={cn(
        "group/row relative flex items-center gap-2 bg-background py-1 pr-1.5 pl-3",
        isDragging && "z-10 shadow-sm"
      )}
    >
      {sortable && (
        <button
          type="button"
          aria-label="Reorder queued message"
          className="text-muted-foreground absolute left-0 flex h-full w-3 cursor-grab items-center justify-center opacity-0 outline-none transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-3" />
        </button>
      )}
      <NativeQueuedMessagePreview
        inputId={item.inputId}
        preview={item.goalStart?.objective ?? item.preview}
        label={label}
        attachments={item.attachments}
        displayParts={item.displayParts}
        readImage={(previewId) =>
          controller.readQueuedAttachmentPreview(item.inputId, previewId)
        }
        readText={
          controller.queueCurrent && !item.goalStart
            ? () => controller.readQueuedText(item.inputId)
            : undefined
        }
      />
      {item.steerable === true && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted-foreground shrink-0"
              disabled={
                locked || !!view.queueDraft || !controller.canSteerQueued(item)
              }
              onClick={() => void controller.steerQueued(item.inputId)}
            >
              <CornerDownRightIcon className="size-3.5" />
              Steer
            </Button>
          </TooltipTrigger>
          <TooltipContent>Submit without interrupting the model</TooltipContent>
        </Tooltip>
      )}
      <TrayIcon
        label="Remove from queue"
        disabled={rowLocked}
        onClick={() => {
          const onRemoved = prepareQueueRemoval?.(item.inputId);
          void controller
            .editQueue({
              action: "withdraw",
              inputId: item.inputId,
            })
            .then((removed) => {
              if (removed) onRemoved?.();
            });
        }}
      >
        <Trash2Icon />
      </TrayIcon>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground shrink-0"
            aria-label="More queue actions"
            disabled={rowLocked}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl">
          <DropdownMenuItem
            disabled={!editable}
            onSelect={() => void controller.editQueuedText(item.inputId)}
          >
            <PencilIcon className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={rowLocked || position === 0}
            onSelect={() =>
              void controller.editQueue({
                action: "move",
                inputId: item.inputId,
                direction: "up",
              })
            }
          >
            <ArrowUpIcon className="size-4" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={rowLocked || position + 1 >= queued}
            onSelect={() =>
              void controller.editQueue({
                action: "move",
                inputId: item.inputId,
                direction: "down",
              })
            }
          >
            <ArrowDownIcon className="size-4" />
            Move down
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function GoalStrip({
  controller,
  view,
  goal,
}: {
  controller: NativeChatController;
  view: NativeChatView;
  goal: NativeChatGoal | null;
}) {
  const [draft, setDraft] = useState<{
    goalId: string;
    goalRevision: number;
    text: string;
  } | null>(null);
  const elapsed = useGoalElapsed(goal, view);
  const goalRevision = view.goal?.goalRevision;
  const editing = draft && goal?.goalId === draft.goalId ? draft : null;

  if (!goal) {
    // A goal started while the agent works waits for its place in the queue.
    const snapshot = view.observation?.snapshot;
    const waiting = !!snapshot?.current || !!snapshot?.admissionPaused;
    return (
      <div className="flex items-center gap-2 py-2 pr-1.5 pl-3" role="status">
        <GoalIcon className="text-muted-foreground size-4 shrink-0" />
        <span>{waiting ? "Goal waits in the queue" : "Starting goal"}</span>
      </div>
    );
  }

  if (editing)
    return (
      <form
        className="space-y-2 p-2"
        aria-label="Edit goal"
        onSubmit={(event) => {
          event.preventDefault();
          const text = editing.text.trim();
          // A goal started here uses its objective as its criterion; keep
          // separately authored criteria when they exist.
          const derived =
            goal.criteria.length === 1 && goal.criteria[0] === goal.objective;
          void controller
            .reviseGoal(
              {
                scope: view.scope,
                goalId: editing.goalId,
                goalRevision: editing.goalRevision,
              },
              {
                description: text,
                criteria: derived ? [text] : goal.criteria,
              }
            )
            .then((accepted) => accepted && setDraft(null));
        }}
      >
        <Textarea
          aria-label="Goal"
          autoFocus
          value={editing.text}
          disabled={view.acting}
          className="min-h-16 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
          onChange={(event) =>
            setDraft({ ...editing, text: event.currentTarget.value })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") setDraft(null);
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={view.acting}
            onClick={() => setDraft(null)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="xs"
            disabled={
              view.acting ||
              !editing.text.trim() ||
              editing.text.trim() === goal.objective
            }
          >
            Save
          </Button>
        </div>
      </form>
    );

  const canResume = controller.canControlGoal("resume");
  const canPause = controller.canControlGoal("pause");
  return (
    <div className="flex items-center gap-2 py-1 pr-1.5 pl-3">
      <GoalIcon className="text-muted-foreground size-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate" title={goal.objective}>
        <span role="status">{goalLabel(goal)}</span>{" "}
        <span className="text-muted-foreground">{goal.objective}</span>
        {elapsed && <span className="text-muted-foreground"> · {elapsed}</span>}
      </p>
      {controller.canControlGoal("confirm_completion") && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="shrink-0"
          title={goal.review?.summary}
          onClick={() => void controller.controlGoal("confirm_completion")}
        >
          Confirm
        </Button>
      )}
      {controller.canControlGoal("reconcile_review") && (
        <TrayIcon
          label="Refresh goal allowance"
          onClick={() => void controller.controlGoal("reconcile_review")}
        >
          <RefreshCwIcon />
        </TrayIcon>
      )}
      <TrayIcon
        label={goal.state.status === "complete" ? "Dismiss goal" : "Clear goal"}
        disabled={!controller.canControlGoal("clear")}
        onClick={() => void controller.controlGoal("clear")}
      >
        <Trash2Icon />
      </TrayIcon>
      {canResume ? (
        <TrayIcon
          label="Resume goal"
          onClick={() => void controller.controlGoal("resume")}
        >
          <PlayIcon />
        </TrayIcon>
      ) : canPause ? (
        <TrayIcon
          label="Pause goal"
          onClick={() => void controller.controlGoal("pause")}
        >
          <PauseIcon />
        </TrayIcon>
      ) : null}
      {goal.state.status !== "complete" && goalRevision !== undefined && (
        <TrayIcon
          label="Edit goal"
          disabled={!controller.canControlGoal("revise")}
          onClick={() =>
            setDraft({
              goalId: goal.goalId,
              goalRevision,
              text: goal.objective,
            })
          }
        >
          <PencilIcon />
        </TrayIcon>
      )}
    </div>
  );
}

function TrayIcon({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground shrink-0"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const BLOCKED = {
  needs_input: "Goal needs input",
  capability_unavailable: "Goal can't continue",
  no_progress: "Goal stalled",
  unverified_completion: "Goal needs review",
  uncertain_work: "Goal interrupted",
} as const;

function goalLabel(goal: NativeChatGoal): string {
  if (goal.review?.status === "pending") return "Review goal";
  switch (goal.state.status) {
    case "complete":
      return "Goal complete";
    case "exhausted":
      return "Goal out of allowance";
    case "blocked":
      return BLOCKED[goal.state.reason];
    case "cleared":
      return "Goal cleared";
    case "active":
      return goal.paused ? "Paused goal" : "Pursuing goal";
  }
}

/** Time spent on the goal's current turn, ticking while it runs. */
function useGoalElapsed(
  goal: NativeChatGoal | null,
  view: NativeChatView
): string | null {
  const turnId = goal?.reservation?.turnId;
  const started = turnId
    ? view.turnRecords.find((record) => record.turnId === turnId)?.startedAtMs
    : undefined;
  const current = view.observation?.snapshot.current;
  const running =
    !!turnId &&
    current?.turnId === turnId &&
    current.disposition === "running" &&
    !current.paused;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (started === undefined || !running) return null;
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
