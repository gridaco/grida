import { useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type {
  NativeChatMessage,
  NativeSubagentLifecycleEvent,
} from "@grida/desktop-bridge";
import { ChatMessageView, ToolCallGroupView } from "@/kits/agent-chat";
import { native_tool_parts } from "@/lib/agent-chat/native-tool-parts";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeSubagentIdentity } from "./native-subagent-identity";

/**
 * One turn of the native transcript. While the turn runs, its commentary and
 * activity stay in view. Once it finishes, they collapse beneath a header and
 * the final answer stays visible. Disclosure only reveals recorded work.
 */
export function NativeTurnActivity({
  block,
  renderMessage,
  subagentEvents = [],
  onOpenSubagent,
  loadToolImage,
}: {
  block: Extract<turn_activity.Block, { kind: "turn" }>;
  renderMessage: (message: NativeChatMessage) => ReactNode;
  subagentEvents?: readonly NativeSubagentLifecycleEvent[];
  onOpenSubagent?: (childId: string, inputId: string) => void;
  loadToolImage?: (previewId: string) => Promise<Blob>;
}) {
  const [expanded, setExpanded] = useState(false);
  // A stopped turn shows its partial work as is; there is no answer to keep
  // apart from it.
  const stopped = block.outcome === "cancelled";
  const open = !block.finished || stopped || expanded;
  const timeline = turn_activity.merge(
    block.work,
    subagentEvents,
    block.turnId
  );
  const hasWork =
    (timeline.work.length > 0 || timeline.unplaced.length > 0) && !stopped;
  return (
    <div
      data-testid="native-turn-activity"
      data-turn-id={block.turnId}
      data-state={
        block.finished ? (open ? "expanded" : "collapsed") : "running"
      }
      className="flex flex-col gap-4"
    >
      {block.requests.map(renderMessage)}
      {(turn_activity.showsHeader(block) ||
        (block.finished && subagentEvents.length > 0)) && (
        <div className="border-b pb-1">
          {hasWork ? (
            <button
              type="button"
              aria-expanded={open}
              className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-xs"
              onClick={() => setExpanded((value) => !value)}
            >
              {turn_activity.header(block.outcome, block.durationMs)}
              {open ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
            </button>
          ) : (
            <p className="text-muted-foreground text-xs">
              {turn_activity.header(block.outcome, block.durationMs)}
            </p>
          )}
        </div>
      )}
      {open &&
        timeline.work.map((item) =>
          item.kind === "commentary" ? (
            <ChatMessageView
              key={item.message.messageId}
              // A turn's actions sit under its final answer only.
              actions={{ hidden: true }}
              message={{
                id: item.message.messageId,
                role: item.message.role,
                parts: [{ type: "text", text: item.message.text }],
              }}
            />
          ) : item.kind === "subagent" ? (
            <SubagentEventRow
              key={item.key}
              event={item.event}
              onOpen={onOpenSubagent}
            />
          ) : (
            <ToolCallGroupView
              key={item.key}
              entries={item.calls.map(native_tool_parts.entry)}
              loadToolImage={loadToolImage}
            />
          )
        )}
      {open && timeline.unplaced.length > 0 && (
        <section
          className="space-y-2"
          aria-label="Subagent events — relative order unavailable"
        >
          <p className="text-xs text-muted-foreground">
            Subagent events — relative order unavailable
          </p>
          {timeline.unplaced.map((event) => (
            <SubagentEventRow
              key={event.eventId}
              event={event}
              onOpen={onOpenSubagent}
            />
          ))}
        </section>
      )}
      {block.answers.map(renderMessage)}
    </div>
  );
}

function SubagentEventRow({
  event,
  onOpen,
}: {
  event: NativeSubagentLifecycleEvent;
  onOpen?: (childId: string, inputId: string) => void;
}) {
  return (
    <button
      type="button"
      className="group/subagent flex w-full items-center gap-2 rounded-md py-1 text-left text-xs text-[color-mix(in_oklab,var(--color-muted-foreground)_80%,var(--color-foreground))]"
      onClick={() => onOpen?.(event.childId, event.inputId)}
      disabled={!onOpen}
    >
      <NativeSubagentIdentity childId={event.childId} className="size-5" />
      <span className="min-w-0 flex-1">
        <span className="font-medium transition-colors group-hover/subagent:text-foreground group-focus-visible/subagent:text-foreground">
          {event.name}
        </span>{" "}
        {event.kind === "started"
          ? "started working"
          : event.status === "failed"
            ? "failed"
            : event.status === "cancelled"
              ? "stopped"
              : event.status === "uncertain"
                ? "finished · result uncertain"
                : "finished"}
      </span>
    </button>
  );
}
