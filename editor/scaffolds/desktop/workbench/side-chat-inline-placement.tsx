"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@app/ui/lib/utils";
import { NativeSideChatPane } from "./native-agent-pane";
import type {
  SideChatPlacement,
  SideChatPresentation,
} from "./side-chat-placement";

/**
 * Presents side chats inline, for a host without a tabbed editor region (the
 * file window). The host renders {@link SideChatInlineRegion} where side chats
 * belong. The region shows one side chat at a time: the one opened or asked
 * to show most recently. The others stay open beneath it, and closing the
 * shown one shows the one before it. The region is empty while none is open.
 */
export class SideChatInlinePlacement implements SideChatPlacement {
  /** Open side chats, the shown one last. */
  private stack: readonly SideChatPresentation[] = [];
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The side chat shown, or `null` while none is open. */
  readonly read = (): SideChatPresentation | null => this.stack.at(-1) ?? null;

  present(presentation: SideChatPresentation): void {
    this.set([
      ...this.stack.filter(({ id }) => id !== presentation.id),
      presentation,
    ]);
  }

  withdraw(id: string): void {
    if (this.stack.some((presentation) => presentation.id === id))
      this.set(this.stack.filter((presentation) => presentation.id !== id));
  }

  private set(stack: readonly SideChatPresentation[]): void {
    this.stack = stack;
    for (const listener of this.listeners) listener();
  }
}

/** Where the host shows an inline side chat; empty while none is open. */
export function SideChatInlineRegion({
  placement,
  className,
}: {
  placement: SideChatInlinePlacement;
  className?: string;
}) {
  const presentation = useSyncExternalStore(
    placement.subscribe,
    placement.read,
    placement.read
  );
  if (!presentation) return null;
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <NativeSideChatPane key={presentation.id} presentation={presentation} />
    </div>
  );
}
