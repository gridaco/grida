import { useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { ChatMessageView, ToolCallGroupView } from "@/kits/agent-chat";
import { native_tool_parts } from "@/lib/agent-chat/native-tool-parts";
import { turn_activity } from "@/lib/agent-chat/turn-activity";

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
  // A stopped turn shows its partial work as is; there is no answer to keep
  // apart from it.
  const stopped = block.outcome === "cancelled";
  const open = !block.finished || stopped || expanded;
  const hasWork = block.work.length > 0 && !stopped;
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
      {turn_activity.showsHeader(block) && (
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
              // A turn's actions sit under its final answer only.
              actions={{ hidden: true }}
              message={{
                id: item.message.messageId,
                role: item.message.role,
                parts: [{ type: "text", text: item.message.text }],
              }}
            />
          ) : (
            <ToolCallGroupView
              key={item.key}
              entries={item.calls.map(native_tool_parts.entry)}
            />
          )
        )}
      {block.answers.map(renderMessage)}
    </div>
  );
}
