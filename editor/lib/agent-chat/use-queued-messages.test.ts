/**
 * Contract test for the queued-mirror reconcile (RFC `queue`). The mirror is
 * the renderer's optimistic view; the CORE owns the real queue and drains it.
 * The merge must reflect server truth — including a row the core drained —
 * while not wiping an enqueue whose POST is still in flight.
 *
 * Regression: the FIRST drained item used to LINGER forever. The core dequeues
 * it before any refetch confirms it, so it left `list_queued` while still in
 * the optimistic set — and the old merge re-added "any optimistic row not on
 * the server", treating a drained row like an unconfirmed enqueue. The fix:
 * the merge keeps only PENDING (POST-in-flight) rows, and a resolved enqueue
 * leaves the pending set. This pins both halves of that contract.
 */

import { describe, expect, it } from "vitest";
import { mergeQueuedMirror } from "./use-queued-messages";
import type { ChatMessageWithParts } from "@/lib/desktop/bridge";

// Minimal row — the merge only reads `id` + `metadata.queued_at`.
function row(id: string, queuedAt: number): ChatMessageWithParts {
  return {
    id,
    metadata: { queued_at: queuedAt },
  } as unknown as ChatMessageWithParts;
}

describe("mergeQueuedMirror", () => {
  it("drops a row the core drained (gone from server, POST already resolved)", () => {
    // The reported bug: type 2..7, the core drains "2" first — before any
    // refetch confirmed it — and "2" must NOT linger in the mirror.
    const server = [row("3", 3), row("4", 4), row("5", 5)];
    const prev = [row("2", 2), row("3", 3), row("4", 4), row("5", 5)];
    const pending = new Set<string>(); // every enqueue POST has resolved
    expect(mergeQueuedMirror(server, prev, pending).map((m) => m.id)).toEqual([
      "3",
      "4",
      "5",
    ]);
  });

  it("keeps an in-flight optimistic row the server hasn't surfaced yet", () => {
    // The window between the optimistic add and the enqueue POST committing:
    // the row isn't on the server, but it's PENDING, so a concurrent refetch
    // must not wipe it.
    const server: ChatMessageWithParts[] = [];
    const prev = [row("opt", 9)];
    expect(
      mergeQueuedMirror(server, prev, new Set(["opt"])).map((m) => m.id)
    ).toEqual(["opt"]);
  });

  it("merges server truth + pending and orders FIFO by queued_at", () => {
    const server = [row("b", 2)];
    const prev = [row("a", 1), row("b", 2)]; // "a" still pending
    expect(
      mergeQueuedMirror(server, prev, new Set(["a"])).map((m) => m.id)
    ).toEqual(["a", "b"]);
  });

  it("a confirmed (no longer pending) row follows server truth, not prev", () => {
    // "a" was confirmed earlier (removed from pending). If the server still
    // lists it, it stays — via server truth, not the pending path.
    const server = [row("a", 1), row("b", 2)];
    const prev = [row("a", 1)];
    expect(
      mergeQueuedMirror(server, prev, new Set<string>()).map((m) => m.id)
    ).toEqual(["a", "b"]);
  });
});
