"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useConversationContext } from "@app/ui/ai-elements/conversation";

/** How far above the top edge the next page starts loading. */
const PRELOAD_MARGIN_PX = 400;

/**
 * The top of a transcript with older pages. Scrolling near it loads the next
 * page, which is prepended without moving what the reader is looking at.
 * See test/desktop-agent-chat-transcript-history.md.
 */
export function NativeEarlierMessages({
  canLoad,
  loading,
  error,
  count,
  onLoad,
}: {
  canLoad: boolean;
  loading: boolean;
  error: string | null;
  /** Loaded message count; a change after a load restores the scroll. */
  count: number;
  onLoad: () => void;
}) {
  const { scrollRef } = useConversationContext();
  const sentinel = useRef<HTMLDivElement>(null);
  // Distance from the bottom when a load started.
  const anchor = useRef<number | null>(null);
  const load = useRef(onLoad);
  load.current = onLoad;

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinel.current;
    if (!root || !target || !canLoad || loading || error) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        anchor.current = root.scrollHeight - root.scrollTop;
        load.current();
      },
      { root, rootMargin: `${PRELOAD_MARGIN_PX}px 0px 0px 0px` }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRef, canLoad, loading, error]);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || anchor.current === null || loading) return;
    root.scrollTop = root.scrollHeight - anchor.current;
    anchor.current = null;
  }, [scrollRef, count, loading]);

  if (!canLoad && !error) return null;
  return (
    <div
      ref={sentinel}
      className="text-muted-foreground flex min-h-6 items-center justify-center text-xs"
    >
      {error ? (
        <span role="status">
          {error}{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              const root = scrollRef.current;
              if (root) anchor.current = root.scrollHeight - root.scrollTop;
              onLoad();
            }}
          >
            Try again
          </button>
        </span>
      ) : loading ? (
        <span role="status">Loading earlier messages…</span>
      ) : null}
    </div>
  );
}
