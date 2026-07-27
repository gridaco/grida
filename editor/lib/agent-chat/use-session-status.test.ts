/**
 * Contract test for {@link coreTurnSyncAction} — the decision behind
 * `useCoreTurnSync` (RFC `queue` / `session status`).
 *
 * Regression: a supervised-approval resume was cut off because the hook called
 * `resumeStream()` on EVERY `busy` edge it didn't recognize as its own, even
 * when there was no queued turn to promote. A client's own resume send races
 * the busy edge faster than `isStreaming` commits, so the bare-`busy` path
 * reconnected a second stream over the live send, dropped the assistant holding
 * the approved tool's part, and the reducer threw "No tool invocation found" →
 * stream cancel → run abort. The final fix uses the core's fired-message id
 * for queue drains and routes id-less remote continuations through the same
 * owner-gated resume path, which coalesces duplicate local attach intents.
 */

import { describe, expect, it } from "vitest";
import {
  CoreStatusEdgeRevision,
  coreTurnSyncAction,
  createSessionStatusFramePump,
  sessionStatusReconnectDelay,
  type CoreRunState,
} from "./use-session-status";
import type { UIMessage } from "ai";
import type { ChatMessageWithParts } from "@/lib/desktop/bridge";

// The decision only reads `id` off the queued head.
function head(id: string): ChatMessageWithParts {
  return { id } as unknown as ChatMessageWithParts;
}

const base = {
  coreState: "busy" as CoreRunState | null,
  coreMessageId: "m1" as string | null,
  prevState: "idle" as CoreRunState | null,
  prevIsStreaming: false,
  isStreaming: false,
  queued: [] as ChatMessageWithParts[],
  messages: [] as UIMessage[],
};

describe("coreTurnSyncAction", () => {
  it("a bare busy edge uses the owner-gated compatibility attach", () => {
    // An older sidecar has no fired-message identity. Rehydrate + request an
    // attach so a remote direct turn is not missed; for this client's own
    // send, the attach owner already holds the transport and denies a duplicate.
    expect(coreTurnSyncAction({ ...base, coreMessageId: null })).toEqual({
      type: "attach",
      firedMessageId: null,
    });
  });

  it("a real drain promotes the exact message id named by the core", () => {
    expect(coreTurnSyncAction({ ...base, queued: [head("m1")] })).toEqual({
      type: "drain",
      fired: head("m1"),
    });
  });

  it("attaches authoritatively when a remote fired id beat queue hydration", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreMessageId: "m2",
        queued: [head("m1")],
      })
    ).toEqual({ type: "attach", firedMessageId: "m2" });
  });

  it("ignores a fired id already in the transcript (this client's send)", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        messages: [
          {
            id: "m1",
            role: "user",
            parts: [{ type: "text", text: "local send" }],
          },
        ],
      })
    ).toEqual({ type: "ignore" });
  });

  it.each(["waiting_on_approval", "waiting_on_user_input"] as const)(
    "rehydrates and attaches a remote %s continuation with no fired message id",
    (prevState) => {
      expect(
        coreTurnSyncAction({
          ...base,
          coreMessageId: null,
          prevState,
          queued: [head("m1")],
        })
      ).toEqual({ type: "attach", firedMessageId: null });
    }
  );

  it("asks for authoritative confirmation on a legacy idle→busy edge", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreMessageId: null,
        queued: [head("m1")],
      })
    ).toEqual({ type: "confirm", candidate: head("m1") });
  });

  it("a turn THIS client started (isStreaming) is ignored even with a queued head", () => {
    expect(
      coreTurnSyncAction({ ...base, isStreaming: true, queued: [head("m1")] })
    ).toEqual({ type: "ignore" });
  });

  it("a named busy first frame after reconnect still drains the exact row", () => {
    expect(
      coreTurnSyncAction({ ...base, prevState: null, queued: [head("m1")] })
    ).toEqual({ type: "drain", fired: head("m1") });
  });

  it("a named busy first frame attaches when the queue mirror has not hydrated", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreMessageId: "m2",
        prevState: null,
        queued: [],
      })
    ).toEqual({ type: "attach", firedMessageId: "m2" });
  });

  it("an id-less busy first frame safely rehydrates and resumes after reconnect", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreMessageId: null,
        prevState: null,
        queued: [],
      })
    ).toEqual({ type: "attach", firedMessageId: null });
  });

  it("rehydrates when a remote busy turn settles", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        prevState: "busy",
        coreState: "idle",
        queued: [head("m1")],
      })
    ).toEqual({ type: "rehydrate" });
  });

  it.each(["waiting_on_approval", "waiting_on_user_input"] as const)(
    "rehydrates when a remote %s interaction settles without a run",
    (prevState) => {
      expect(
        coreTurnSyncAction({
          ...base,
          coreState: "idle",
          prevState,
        })
      ).toEqual({ type: "rehydrate" });
    }
  );

  it.each(["waiting_on_approval", "waiting_on_user_input"] as const)(
    "rehydrates an authoritative %s first frame so its controls cannot stay absent",
    (coreState) => {
      expect(
        coreTurnSyncAction({
          ...base,
          coreState,
          prevState: null,
          coreMessageId: null,
        })
      ).toEqual({ type: "rehydrate" });
    }
  );

  it("rehydrates when authoritative waiting kind changes in another window", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreState: "waiting_on_user_input",
        prevState: "waiting_on_approval",
        coreMessageId: null,
      })
    ).toEqual({ type: "rehydrate" });
  });

  it("does not replace this client's still-live stream on a waiting edge", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreState: "waiting_on_approval",
        prevState: "busy",
        coreMessageId: null,
        isStreaming: true,
      })
    ).toEqual({ type: "ignore" });
  });

  it("rehydrates a waiting frame once this client's final stream settles", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreState: "waiting_on_approval",
        prevState: "waiting_on_approval",
        coreMessageId: null,
        prevIsStreaming: true,
        isStreaming: false,
      })
    ).toEqual({ type: "rehydrate" });
  });

  it("rehydrates an authoritative idle first frame after reconnect", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreState: "idle",
        prevState: null,
      })
    ).toEqual({ type: "rehydrate" });
  });

  it("does not overwrite this client's live stream on a settle edge", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        coreState: "idle",
        prevState: "busy",
        isStreaming: true,
      })
    ).toEqual({ type: "ignore" });
  });

  it("a repeat of the same state (no transition) is ignored", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        prevState: "busy",
        coreState: "busy",
        queued: [head("m1")],
      })
    ).toEqual({ type: "ignore" });
  });

  it("a null coreState is ignored", () => {
    expect(
      coreTurnSyncAction({ ...base, coreState: null, queued: [head("m1")] })
    ).toEqual({ type: "ignore" });
  });
});

describe("CoreStatusEdgeRevision", () => {
  it("invalidates an async hydration token on a newer status edge", () => {
    const revisions = new CoreStatusEdgeRevision();
    const idle = revisions.observe({
      sessionId: "ses_1",
      state: "idle",
      messageId: null,
      isStreaming: false,
    });
    expect(revisions.isCurrent(idle)).toBe(true);

    revisions.observe({
      sessionId: "ses_1",
      state: "busy",
      messageId: "m1",
      isStreaming: false,
    });
    expect(revisions.isCurrent(idle)).toBe(false);
  });

  it("stays monotonic across an ABA idle→busy→idle sequence", () => {
    const revisions = new CoreStatusEdgeRevision();
    const firstIdle = revisions.observe({
      sessionId: "ses_1",
      state: "idle",
      messageId: null,
      isStreaming: false,
    });
    revisions.observe({
      sessionId: "ses_1",
      state: "busy",
      messageId: "m1",
      isStreaming: true,
    });
    const secondIdle = revisions.observe({
      sessionId: "ses_1",
      state: "idle",
      messageId: null,
      isStreaming: false,
    });

    expect(secondIdle).toBeGreaterThan(firstIdle);
    expect(revisions.isCurrent(firstIdle)).toBe(false);
    expect(revisions.isCurrent(secondIdle)).toBe(true);
  });

  it("does not churn on unrelated renders of the same edge", () => {
    const revisions = new CoreStatusEdgeRevision();
    const edge = {
      sessionId: "ses_1",
      state: "waiting_on_approval" as const,
      messageId: null,
      isStreaming: false,
    };
    expect(revisions.observe(edge)).toBe(revisions.observe(edge));
  });

  it("invalidates idle hydration when a local stream starts before core busy arrives", () => {
    const revisions = new CoreStatusEdgeRevision();
    const idle = revisions.observe({
      sessionId: "ses_1",
      state: "idle",
      messageId: null,
      isStreaming: false,
    });
    revisions.observe({
      sessionId: "ses_1",
      state: "idle",
      messageId: null,
      isStreaming: true,
    });
    expect(revisions.isCurrent(idle)).toBe(false);
  });
});

describe("sessionStatusReconnectDelay", () => {
  it("backs off quickly and caps reconnect latency", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(sessionStatusReconnectDelay)).toEqual([
      250, 500, 1_000, 2_000, 4_000, 5_000, 5_000,
    ]);
  });
});

describe("createSessionStatusFramePump", () => {
  it("emits synchronous transport frames in distinct scheduled turns", () => {
    const scheduled: Array<() => void> = [];
    const emitted: Array<string | null> = [];
    const pump = createSessionStatusFramePump(
      (frame) => emitted.push(frame?.state ?? null),
      (flush) => scheduled.push(flush)
    );

    pump.enqueue({ state: "busy", message_id: "m1" });
    pump.enqueue({ state: "idle" });
    pump.enqueue(null);

    expect(emitted).toEqual([]);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    expect(emitted).toEqual(["busy"]);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    expect(emitted).toEqual(["busy", "idle"]);
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    expect(emitted).toEqual(["busy", "idle", null]);
    expect(scheduled).toHaveLength(0);
  });

  it("drops queued frames after disposal", () => {
    const scheduled: Array<() => void> = [];
    const emitted: Array<string | null> = [];
    const pump = createSessionStatusFramePump(
      (frame) => emitted.push(frame?.state ?? null),
      (flush) => scheduled.push(flush)
    );

    pump.enqueue({ state: "busy" });
    pump.dispose();
    scheduled.shift()?.();
    pump.enqueue({ state: "idle" });

    expect(emitted).toEqual([]);
    expect(scheduled).toHaveLength(0);
  });
});
