/**
 * Contract tests for the turn-queue decision core (RFC
 * docs/wg/ai/agent/queue.md). The DRAIN is CORE state now — its FIFO / serial /
 * "Stop drains the next" / "a hard error pauses" behavior is the
 * `SessionScheduler`'s contract (see
 * `packages/grida-ai-agent/src/runtime/session-scheduler.test.ts`). What stays
 * the host's decision, and is pinned here, is the one client rule:
 *
 *   - what counts as client-local "busy" (incl. an in-flight compaction), and
 *   - a submit while busy ENQUEUES rather than starting a second turn.
 *
 * If either regresses, these fail — the system hard-fails here rather than only
 * in a hard-to-reproduce desktop session.
 */

import { describe, expect, it } from "vitest";
import { decideSubmit, isSessionBusy } from "./turn-queue";

describe("isSessionBusy", () => {
  it("a streaming/submitted turn is busy", () => {
    expect(isSessionBusy("submitted", false)).toBe(true);
    expect(isSessionBusy("streaming", false)).toBe(true);
  });

  it("idle/error are not busy on their own", () => {
    expect(isSessionBusy("ready", false)).toBe(false);
    expect(isSessionBusy("error", false)).toBe(false);
  });

  it("an in-flight maintenance op (compaction) is busy even while idle", () => {
    // /compact runs as a separate op — `status` stays "ready", so without
    // folding it into "busy" the compositor would send straight into a new
    // turn instead of queuing.
    expect(isSessionBusy("ready", true)).toBe(true);
  });
});

describe("decideSubmit — enqueue vs. send now", () => {
  it("sends when the session is idle", () => {
    expect(decideSubmit({ busy: false })).toBe("send");
  });

  it("enqueues while the session is busy", () => {
    expect(decideSubmit({ busy: true })).toBe("enqueue");
  });

  it("enqueues while a compaction is in flight", () => {
    const busy = isSessionBusy("ready", /* compacting */ true);
    expect(decideSubmit({ busy })).toBe("enqueue");
  });

  it("after a hard error the session is idle — a submit sends (breaks the pause)", () => {
    // The core drain pauses on error, but a NEW user submit must still fire —
    // it is the "next fired turn" that clears the error and resumes the drain.
    const busy = isSessionBusy("error", false);
    expect(decideSubmit({ busy })).toBe("send");
  });
});
