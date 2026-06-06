/**
 * Queued sends region (RFC `queue`) — the muted, pending messages the user
 * typed while a turn is streaming, rendered directly above the composer.
 * Each row carries a hover-revealed X to cancel it before it fires.
 *
 * Render-only and props-driven: the queue itself is core state surfaced via
 * `useQueuedMessages`. Mirrors the user-bubble framing in
 * `@/kits/agent-chat` so a queued message looks like the message it will
 * become, only dimmed.
 */

"use client";

import { XIcon } from "lucide-react";
import {
  Message,
  MessageAction,
  MessageContent,
  MessageResponse,
} from "@app/ui/ai-elements/message";
import { queuedMessageText } from "@/lib/agent-chat";
import type { ChatMessageWithParts } from "@/lib/desktop/bridge";

// Same reveal-on-hover discipline as the kit's message actions: gate
// pointer-events with opacity so a hidden X is never hit-testable. Opacity
// (not display) keeps the X in flow even while hidden, so its slot is
// reserved — the bubble sits a little left of the right edge by default and
// never shifts on hover.
const revealOnHoverActions =
  "opacity-0 pointer-events-none transition-opacity " +
  "group-hover:opacity-100 group-hover:pointer-events-auto " +
  "focus-within:opacity-100 focus-within:pointer-events-auto";

export function QueuedMessages({
  queued,
  onCancel,
}: {
  queued: ChatMessageWithParts[];
  onCancel: (messageId: string) => void;
}) {
  if (queued.length === 0) return null;
  return (
    <div className="shrink-0 space-y-1.5 px-3 pb-2 opacity-60">
      {queued.map((m) => (
        // Row, not column: the bubble sits at the right edge with the X to
        // its RIGHT (not stacked below). Smaller than a settled turn — it is
        // pending, not history. `from="user"` keeps the bubble framing so a
        // queued message looks like the message it will become, only dimmed.
        <Message key={m.id} from="user" className="flex-row items-center gap-1">
          <MessageContent className="relative max-h-20 overflow-hidden text-xs group-[.is-user]:px-3 group-[.is-user]:py-1.5">
            <MessageResponse>{queuedMessageText(m)}</MessageResponse>
            {/* Bottom fade so a long queued message clips seamlessly instead
                of ending mid-line. The stop color IS the bubble bg
                (`bg-secondary`), so the gradient is invisible over empty
                bubble and only shows where overflowing text sits beneath it:
                a short message gets no visible fade, a clipped one melts into
                the bubble. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-b from-transparent to-secondary" />
          </MessageContent>
          <MessageAction
            className={revealOnHoverActions}
            tooltip="Remove from queue"
            onClick={() => onCancel(m.id)}
          >
            <XIcon />
          </MessageAction>
        </Message>
      ))}
    </div>
  );
}
