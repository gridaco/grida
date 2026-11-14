"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@app/ui/lib/utils";
import { NativeSideChatView } from "./native-side-chat-view";
import type {
  SideChatPlacement,
  SideChatPresentation,
} from "./side-chat-placement";

/**
 * Presents a side chat inline, for a host without a tabbed editor region (the
 * file window). The host renders {@link SideChatInlineRegion} where the side
 * chat belongs; the region is empty while no side chat is open, and
 * the side chat's own close action ends it.
 */
export class SideChatInlinePlacement implements SideChatPlacement {
  private current: SideChatPresentation | null = null;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly read = (): SideChatPresentation | null => this.current;

  present(presentation: SideChatPresentation): void {
    this.set(presentation);
  }

  withdraw(): void {
    this.set(null);
  }

  private set(current: SideChatPresentation | null): void {
    if (this.current === current) return;
    this.current = current;
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
      <NativeSideChatView key={presentation.id} {...presentation} />
    </div>
  );
}
