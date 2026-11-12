"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  NativeChatGoal,
  NativeChatQueueItem,
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
  ListEndIcon,
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

/**
 * The stack attached above the composer: a held-queue notice, waiting
 * messages, then the chat's goal. Each row offers only its direct actions.
 */
export function NativeComposerTray({
  controller,
  view,
  onReturnedText,
}: {
  controller: NativeChatController;
  view: NativeChatView;
  /** Text that left the queue but could not reach the current turn. */
  onReturnedText: (text: string) => void;
}) {
  const queue = view.queue;
  const goal = view.goal?.goal;
  const pendingGoal = !!view.observation?.snapshot.pendingGoalId;
  const showGoal = pendingGoal || (!!goal && goal.state.status !== "cleared");
  const items = queue?.items ?? [];
  const held = items.length > 0 && controller.canResumeQueue;
  if (!items.length && !showGoal) return null;
  return (
    <div
      data-testid="workspace-composer-tray"
      className="mx-2 divide-y overflow-hidden rounded-t-xl border border-b-0 bg-background text-sm"
    >
      {held && (
        <div className="flex items-center gap-2 py-1 pr-1.5 pl-3">
          <PauseIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="text-muted-foreground min-w-0 flex-1 truncate">
            Queue paused because you interrupted
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
      {queue && items.length > 0 && (
        <QueueList
          controller={controller}
          view={view}
          onReturnedText={onReturnedText}
        />
      )}
      {showGoal && (
        <GoalStrip controller={controller} view={view} goal={goal ?? null} />
      )}
    </div>
  );
}

function QueueList({
  controller,
  view,
  onReturnedText,
}: {
  controller: NativeChatController;
  view: NativeChatView;
  onReturnedText: (text: string) => void;
}) {
  const queue = view.queue!;
  const ids = queue.items.map((item) => item.inputId);
  // Show a drop immediately; the next queue page replaces it.
  const [order, setOrder] = useState<{
    basis: readonly string[];
    ids: string[];
  } | null>(null);
  const shown =
    order && order.basis.join("\n") === ids.join("\n") ? order.ids : ids;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const locked = view.acting || !controller.queueCurrent;
  const drop = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
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
    <div className="max-h-48 overflow-y-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={drop}
      >
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          {shown.map((inputId) => {
            const item = queue.items.find((row) => row.inputId === inputId)!;
            return (
              <QueueRow
                key={inputId}
                controller={controller}
                view={view}
                item={item}
                position={queue.offset + queue.items.indexOf(item)}
                sortable={!locked && shown.length > 1}
                onReturnedText={onReturnedText}
              />
            );
          })}
        </SortableContext>
      </DndContext>
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

function QueueRow({
  controller,
  view,
  item,
  position,
  sortable,
  onReturnedText,
}: {
  controller: NativeChatController;
  view: NativeChatView;
  item: NativeChatQueueItem;
  position: number;
  sortable: boolean;
  onReturnedText: (text: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.inputId, disabled: !sortable });
  const queued = view.observation?.snapshot.queuedInputs ?? 0;
  const locked = view.acting || !controller.queueCurrent;
  const draft =
    view.queueDraft?.inputId === item.inputId ? view.queueDraft : null;
  const label = item.goalStart
    ? `Goal: ${item.preview ?? item.goalStart.objective}`
    : `${item.operatingRegime === "plan" ? "Plan · " : item.allowsConfigurationChange ? "Settings permitted · " : ""}${item.effort === "ultra" ? "Ultra · " : ""}${item.preview ?? "Message with other content"}`;
  const editable =
    !locked &&
    !view.queueDraft &&
    !item.goalStart &&
    !item.allowsConfigurationChange &&
    item.preview !== null;
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  if (draft)
    return (
      <form
        ref={setNodeRef}
        style={style}
        aria-label="Edit queued message"
        className="space-y-1 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.saveQueueDraft();
        }}
      >
        <Textarea
          aria-label="Queued message"
          autoFocus
          value={draft.text}
          disabled={view.acting}
          className="min-h-12 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
          onChange={(event) =>
            controller.changeQueueDraft(event.currentTarget.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") controller.closeQueueDraft();
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
            onClick={() => controller.closeQueueDraft()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="xs"
            disabled={view.acting || !draft.text.trim()}
          >
            Save
          </Button>
        </div>
      </form>
    );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/row relative flex items-center gap-2 bg-background py-1 pr-1.5 pl-3",
        isDragging && "z-10 shadow-sm"
      )}
    >
      {sortable && (
        <button
          type="button"
          aria-label="Reorder queued message"
          className="text-muted-foreground absolute left-0 hidden h-full w-3 cursor-grab items-center justify-center group-hover/row:flex active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-3" />
        </button>
      )}
      <ListEndIcon className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      {controller.canSteer && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-muted-foreground shrink-0"
          disabled={!controller.canSteerQueued(item)}
          onClick={() =>
            void controller
              .steerQueued(item.inputId)
              .then((text) => text && onReturnedText(text))
          }
        >
          <CornerDownRightIcon className="size-3.5" />
          Steer
        </Button>
      )}
      <TrayIcon
        label="Remove from queue"
        disabled={locked}
        onClick={() =>
          void controller.editQueue({
            action: "withdraw",
            inputId: item.inputId,
          })
        }
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
            disabled={locked}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!editable}
            onSelect={() => void controller.editQueuedText(item.inputId)}
          >
            <PencilIcon className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={position === 0}
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
            disabled={position + 1 >= queued}
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

  if (!goal)
    return (
      <div className="flex items-center gap-2 py-2 pr-1.5 pl-3" role="status">
        <GoalIcon className="text-muted-foreground size-4 shrink-0" />
        <span>Starting goal</span>
      </div>
    );

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
