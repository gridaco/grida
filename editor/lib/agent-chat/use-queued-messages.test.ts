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

import { describe, expect, it, vi } from "vitest";
import {
  enqueueQueuedMessageWithRetry,
  mergeQueuedMirror,
  shouldRetryQueuedEnqueue,
  upsertQueuedMirrorRow,
} from "./use-queued-messages";
import type { ChatMessageWithParts } from "@/lib/desktop/bridge";

type Enqueue = (
  sessionId: string,
  message: { id: string; text: string }
) => Promise<ChatMessageWithParts>;

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

describe("upsertQueuedMirrorRow", () => {
  it("keeps one tray row when the same durable id is observed twice", () => {
    const first = row("same", 1);
    const confirmed = row("same", 2);
    expect(upsertQueuedMirrorRow([first, row("other", 3)], confirmed)).toEqual([
      confirmed,
      row("other", 3),
    ]);
  });
});

describe("shouldRetryQueuedEnqueue", () => {
  it("retries ambiguous network and 5xx failures only", () => {
    expect(shouldRetryQueuedEnqueue(new TypeError("fetch failed"))).toBe(true);
    expect(shouldRetryQueuedEnqueue({ status: 503 })).toBe(true);
    expect(shouldRetryQueuedEnqueue({ status: 409 })).toBe(false);
    expect(
      shouldRetryQueuedEnqueue({ name: "AbortError", message: "aborted" })
    ).toBe(false);
    expect(shouldRetryQueuedEnqueue(new Error("validation failed"))).toBe(
      false
    );
  });
});

describe("enqueueQueuedMessageWithRetry", () => {
  it("retries a lost response once with the exact same idempotency key", async () => {
    const durable = row("u-recovery", 10);
    const enqueue = vi.fn<Enqueue>();
    enqueue
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(durable);

    await expect(
      enqueueQueuedMessageWithRetry(
        enqueue,
        "ses_1",
        {
          id: "u-recovery",
          text: "keep this",
        },
        {
          retrySupported: true,
        }
      )
    ).resolves.toBe(durable);
    expect(enqueue).toHaveBeenNthCalledWith(1, "ses_1", {
      id: "u-recovery",
      text: "keep this",
    });
    expect(enqueue).toHaveBeenNthCalledWith(2, "ses_1", {
      id: "u-recovery",
      text: "keep this",
    });
  });

  it("surfaces the second failure after one bounded retry", async () => {
    const enqueue = vi.fn<Enqueue>();
    enqueue
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new Error("second"));

    await expect(
      enqueueQueuedMessageWithRetry(
        enqueue,
        "ses_1",
        {
          id: "u-recovery",
          text: "keep this",
        },
        {
          retrySupported: true,
        }
      )
    ).rejects.toThrow("second");
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("does not retry a deterministic conflict", async () => {
    const conflict = Object.assign(new Error("different payload"), {
      status: 409,
    });
    const enqueue = vi.fn<Enqueue>();
    enqueue.mockRejectedValue(conflict);

    await expect(
      enqueueQueuedMessageWithRetry(
        enqueue,
        "ses_1",
        {
          id: "u-recovery",
          text: "keep this",
        },
        {
          retrySupported: true,
        }
      )
    ).rejects.toBe(conflict);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("reconciles a committed legacy enqueue instead of retrying its id", async () => {
    const durable = row("u-recovery", 10);
    const enqueue = vi
      .fn<Enqueue>()
      .mockRejectedValueOnce(new TypeError("response lost"));

    await expect(
      enqueueQueuedMessageWithRetry(
        enqueue,
        "ses_1",
        { id: "u-recovery", text: "keep this" },
        {
          retrySupported: false,
          findCommitted: async () => durable,
        }
      )
    ).resolves.toBe(durable);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("does not reuse an id against a legacy sidecar when reconciliation is empty", async () => {
    const lost = new TypeError("response lost");
    const enqueue = vi.fn<Enqueue>().mockRejectedValueOnce(lost);

    await expect(
      enqueueQueuedMessageWithRetry(
        enqueue,
        "ses_1",
        { id: "u-recovery", text: "keep this" },
        {
          retrySupported: false,
          findCommitted: async () => null,
        }
      )
    ).rejects.toBe(lost);
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
