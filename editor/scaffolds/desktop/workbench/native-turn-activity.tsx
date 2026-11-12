import { useState, type ReactNode } from "react";
import { BlocksIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type {
  NativeChatActivity,
  NativeChatMessage,
} from "@grida/desktop-bridge";
import { ChatMessageView } from "@/kits/agent-chat";
import { turn_activity } from "@/lib/agent-chat/turn-activity";

const OUTCOME_LABEL: Record<NativeChatActivity["outcome"], string> = {
  running: "running",
  succeeded: "done",
  failed: "failed",
  cancelled: "stopped",
  uncertain: "unconfirmed",
};

/**
 * One turn of the native transcript. While the turn runs, its commentary and
 * activity stay in view. Once it finishes, they collapse beneath a header and
 * the final answer stays visible. Disclosure only reveals recorded work.
 */
export function NativeTurnActivity({
  block,
  renderMessage,
}: {
  block: Extract<turn_activity.Block, { kind: "turn" }>;
  renderMessage: (message: NativeChatMessage) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = !block.finished || expanded;
  const hasWork = block.work.length > 0;
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
      {block.finished && (
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
        block.work.map((item) =>
          item.kind === "commentary" ? (
            <ChatMessageView
              key={item.message.messageId}
              message={{
                id: item.message.messageId,
                role: item.message.role,
                parts: [{ type: "text", text: item.message.text }],
              }}
            />
          ) : (
            <ActivityLine key={item.key} calls={item.calls} />
          )
        )}
      {block.answers.map(renderMessage)}
    </div>
  );
}

function ActivityLine({ calls }: { calls: readonly NativeChatActivity[] }) {
  const [open, setOpen] = useState(false);
  const running = calls.some((call) => call.outcome === "running");
  const unsuccessful = turn_activity.unsuccessful(calls);
  return (
    <div data-testid="native-turn-activity-line" className="text-xs">
      <button
        type="button"
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <BlocksIcon className="size-3.5 shrink-0" />
        <span>
          {turn_activity.describe(calls)}
          {running && "…"}
          {unsuccessful > 0 && ` · ${unsuccessful} not completed`}
        </span>
      </button>
      {open && (
        <ul className="text-muted-foreground mt-1 space-y-0.5 pl-5.5">
          {calls.map((call) => (
            <li key={call.callId} className="flex gap-2">
              <span className="font-mono">{call.title}</span>
              <span>{OUTCOME_LABEL[call.outcome]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
