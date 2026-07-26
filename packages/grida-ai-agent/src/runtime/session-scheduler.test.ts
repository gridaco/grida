/**
 * GRIDA-SEC-004 — session scheduling and the read-only status-hydration
 * boundary.
 *
 * Contract tests for the core run-state machine (RFC
 * docs/wg/ai/agent/queue.md + session.md §Session status). These are the
 * executable spec for the behaviors the CORE now owns (moved off the UI):
 *
 *   1. status transitions: create → busy, finish/abort →
 *      waiting-or-idle, error → error.
 *   2. SERIAL drain: a clean idle edge fires the earliest queued row, one
 *      turn at a time, FIFO.
 *   3. selection is read-only; the runtime claims only after async preparation
 *      and synchronously reserves the turn.
 *   4. a hard error PAUSES the drain; cancel halts the cascade.
 *   5. a preparation failure preserves the queued row.
 *   6. status subscription delivers current-then-changes.
 *
 * Uses a real in-memory store for list/claim and a fake `drain`; a
 * small real cooldown + `delay()` keeps it deterministic without fake timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import {
  SessionScheduler,
  type SessionSchedulerDeps,
} from "./session-scheduler";

const COOLDOWN = 30;

let tempDir: string;
let opened: OpenedSessionsDb;
let store: SessionsStore;
const live: SessionScheduler[] = [];

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-scheduler-test-"));
  opened = openSessionsDb({ user_data_path: tempDir });
  store = new SessionsStore(opened);
});

afterEach(async () => {
  for (const s of live.splice(0)) s.dispose();
  store.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** A scheduler wired to the real store with an overridable `drain`. The
 *  `pending_human_input_kind` classifier defaults to "never blocked" so the
 *  existing drain tests are unaffected; block-pause tests pass a real kind. */
function makeScheduler(
  drain?: SessionSchedulerDeps["drain"],
  pendingHumanInputKind?: SessionSchedulerDeps["pending_human_input_kind"]
): {
  scheduler: SessionScheduler;
  calls: string[];
} {
  const calls: string[] = [];
  let scheduler!: SessionScheduler;
  const defaultDrain: SessionSchedulerDeps["drain"] = async (
    sid,
    messageId
  ) => {
    const claim = store.claimQueuedMessage(sid, messageId);
    if (!claim) return false;
    calls.push(sid);
    scheduler.onCreate(sid); // a real startTurn would reserve → onCreate
    return true;
  };
  scheduler = new SessionScheduler({
    list_queued: (sid) => store.listQueuedMessages(sid),
    drain: drain ?? defaultDrain,
    pending_human_input_kind: pendingHumanInputKind ?? (async () => null),
    drain_cooldown_ms: COOLDOWN,
  });
  live.push(scheduler);
  return { scheduler, calls };
}

describe("SessionScheduler status", () => {
  it("defaults to idle, goes busy on create, idle on finish/abort", async () => {
    const { scheduler } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    expect(scheduler.getStatus(s.id)).toEqual({ state: "idle" });

    scheduler.onCreate(s.id, "msg_user_1");
    expect(scheduler.getStatus(s.id).state).toBe("busy");
    expect(scheduler.getStatus(s.id).started_at).toEqual(expect.any(Number));
    expect(scheduler.getStatus(s.id).message_id).toBe("msg_user_1");

    // A clean end retains busy while persisted pending-input state is read. It
    // must never expose a transient idle admission window.
    scheduler.onFinish(s.id, "finish");
    expect(scheduler.getStatus(s.id).state).toBe("busy");
    await delay(0);
    expect(scheduler.getStatus(s.id).state).toBe("idle");

    scheduler.onCreate(s.id);
    expect(scheduler.getStatus(s.id).message_id).toBeUndefined();
    scheduler.onFinish(s.id, "abort");
    expect(scheduler.getStatus(s.id).state).toBe("busy");
    await vi.waitFor(() =>
      expect(scheduler.getStatus(s.id).state).toBe("idle")
    );
  });

  it("subscribe delivers the current status immediately, then on change", async () => {
    const { scheduler } = makeScheduler();
    const sid = "ses_sub";
    const seen: string[] = [];
    const unsub = scheduler.subscribe(sid, (st) => seen.push(st.state));
    expect(seen).toEqual(["idle"]); // current, immediately

    scheduler.onCreate(sid);
    scheduler.onFinish(sid, "finish");
    expect(seen).toEqual(["idle", "busy"]); // no transient idle
    await vi.waitFor(() => expect(seen).toEqual(["idle", "busy", "idle"]));

    unsub();
    scheduler.onCreate(sid);
    expect(seen).toEqual(["idle", "busy", "idle"]); // silent after unsubscribe
  });

  it("a refresh after clean end supersedes an older settle read", async () => {
    let readCount = 0;
    let resolveFirst!: (kind: "approval" | null) => void;
    const { scheduler } = makeScheduler(undefined, () => {
      readCount += 1;
      if (readCount === 1) {
        return new Promise<"approval" | "user-input" | null>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(null);
    });
    const s = await store.create({ agent: "grida" });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");
    expect(scheduler.getStatus(s.id).state).toBe("busy");

    // Rewind/un-rewind calls refresh after the registry entry has ended. Its
    // newer durable read must win even if the original settle read resolves
    // later with stale pre-mutation data.
    await expect(scheduler.refreshStatus(s.id)).resolves.toEqual({
      state: "idle",
    });
    resolveFirst("approval");
    await delay(0);
    expect(scheduler.getStatus(s.id).state).toBe("idle");
  });
});

describe("SessionScheduler drain", () => {
  it("keeps the row queued through the cooldown, then atomically claims + fires", async () => {
    const { scheduler, calls } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "queued" });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");
    expect(scheduler.getStatus(s.id).state).toBe("busy");
    await delay(0);
    expect(scheduler.getStatus(s.id).state).toBe("idle");

    // Right after the idle edge the cooldown timer has NOT fired (it is a fresh
    // task), so the row is STILL queued (visible to the UI as pending) and
    // nothing has fired — it "submits" only when it fires. Asserted within a
    // microtask of onFinish, so it never races the cooldown duration.
    expect((await store.listQueuedMessages(s.id)).map((m) => m.id)).toEqual([
      "q1",
    ]);
    expect(calls).toEqual([]);

    // At fire time (cooldown elapsed): claimed AND fired together.
    await delay(COOLDOWN + 20);
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
    expect(calls).toEqual([s.id]);
  });

  it("a hard error pauses the drain — queued rows wait", async () => {
    const { scheduler, calls } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "queued" });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "error");
    expect(scheduler.getStatus(s.id).state).toBe("error");

    await delay(COOLDOWN + 20);
    expect(calls).toEqual([]); // never drained
    expect((await store.listQueuedMessages(s.id)).map((m) => m.id)).toEqual([
      "q1",
    ]); // still queued
  });

  it("a pending approval pauses the drain — the queued head waits until answered", async () => {
    // A turn blocked awaiting the user's Allow/Deny is NOT a completed turn.
    // The clean stream end must project an explicit wait and hold the queue.
    let pending: "approval" | null = "approval";
    const { scheduler, calls } = makeScheduler(undefined, async () => pending);
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "queued" });

    // Turn 1 pauses for approval: retain busy until persisted classification,
    // then publish waiting — never idle.
    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");
    expect(scheduler.getStatus(s.id).state).toBe("busy");
    await vi.waitFor(() =>
      expect(scheduler.getStatus(s.id).state).toBe("waiting_on_approval")
    );

    await delay(COOLDOWN + 20);
    expect(calls).toEqual([]); // did NOT fire during the approval pause
    expect((await store.listQueuedMessages(s.id)).map((m) => m.id)).toEqual([
      "q1",
    ]); // still queued

    // User answers; the resume turn runs and reaches a true finish.
    pending = null;
    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");
    await delay(0);
    expect(scheduler.getStatus(s.id).state).toBe("idle");

    await delay(COOLDOWN + 20);
    expect(calls).toEqual([s.id]); // now the queued head drains, exactly once
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
  });

  it("distinguishes a human-input tool wait from approval", async () => {
    const { scheduler } = makeScheduler(undefined, async () => "user-input");
    const s = await store.create({ agent: "grida" });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");

    expect(scheduler.getStatus(s.id).state).toBe("busy");
    await vi.waitFor(() =>
      expect(scheduler.getStatus(s.id).state).toBe("waiting_on_user_input")
    );
  });

  it("hydrates a persisted wait before a cold session reads idle", async () => {
    const { scheduler } = makeScheduler(undefined, async () => "approval");
    const s = await store.create({ agent: "grida" });

    expect(scheduler.getStatus(s.id)).toEqual({ state: "idle" });
    await expect(scheduler.hydrateStatus(s.id)).resolves.toEqual({
      state: "waiting_on_approval",
    });
    expect(scheduler.getStatus(s.id)).toEqual({
      state: "waiting_on_approval",
    });
  });

  it("keeps status hydration read-only, then drains on a trusted enqueue edge", async () => {
    const { scheduler, calls } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, {
      id: "q_restart",
      text: "survived restart",
    });

    await expect(scheduler.hydrateStatus(s.id)).resolves.toEqual({
      state: "idle",
    });
    await delay(COOLDOWN + 20);

    // GET /status owns hydration. A leaked query token may observe state but
    // must never acquire run, billing, or filesystem authority.
    expect(calls).toEqual([]);
    expect(await store.listQueuedMessages(s.id)).toHaveLength(1);

    // An authenticated queue mutation is a trusted execution edge. Its stale-
    // busy recovery kick also resumes any durable head that survived restart.
    scheduler.notifyEnqueued(s.id);
    await delay(COOLDOWN + 20);

    expect(calls).toEqual([s.id]);
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
  });

  it("drains a multi-item queue serially, one turn each, FIFO", async () => {
    const order: string[] = [];
    let scheduler!: SessionScheduler;
    const drain: SessionSchedulerDeps["drain"] = async (sid, messageId) => {
      if (!store.claimQueuedMessage(sid, messageId)) return false;
      // The just-claimed head is the latest visible user row.
      const visible = await store.listVisibleMessages(sid);
      order.push(visible.at(-1)!.id);
      scheduler.onCreate(sid);
      setTimeout(() => scheduler.onFinish(sid, "finish"), 3); // settle the turn
      return true;
    };
    scheduler = new SessionScheduler({
      list_queued: (sid) => store.listQueuedMessages(sid),
      drain,
      pending_human_input_kind: async () => null,
      drain_cooldown_ms: COOLDOWN,
    });
    live.push(scheduler);

    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, {
      id: "a",
      text: "first",
      queued_at: 1,
    });
    await store.appendQueuedMessage(s.id, {
      id: "b",
      text: "second",
      queued_at: 2,
    });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish"); // ends the current turn → drain begins

    await vi.waitFor(() => expect(order).toEqual(["a", "b"]), {
      timeout: 2_000,
    }); // FIFO, one turn at a time
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
  });

  it("a cancelled queued row never fires (cancel halts the cascade)", async () => {
    const order: string[] = [];
    let scheduler!: SessionScheduler;
    const drain: SessionSchedulerDeps["drain"] = async (sid, messageId) => {
      if (!store.claimQueuedMessage(sid, messageId)) return false;
      const visible = await store.listVisibleMessages(sid);
      order.push(visible.at(-1)!.id);
      scheduler.onCreate(sid);
      setTimeout(() => scheduler.onFinish(sid, "finish"), 3);
      return true;
    };
    scheduler = new SessionScheduler({
      list_queued: (sid) => store.listQueuedMessages(sid),
      drain,
      pending_human_input_kind: async () => null,
      drain_cooldown_ms: COOLDOWN,
    });
    live.push(scheduler);

    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, {
      id: "a",
      text: "first",
      queued_at: 1,
    });
    await store.appendQueuedMessage(s.id, {
      id: "b",
      text: "second",
      queued_at: 2,
    });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");

    // While "a" is in its cooldown, cancel the still-queued "b".
    await delay(5);
    await store.deleteMessage(s.id, "b");

    await delay(2 * (COOLDOWN + 25));
    expect(order).toEqual(["a"]); // only "a" fired; "b" cancelled before select
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
  });

  it("preserves the row when async turn preparation fails", async () => {
    const { scheduler } = makeScheduler(async () => {
      throw new Error("provider down");
    });
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "x" });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");

    await delay(COOLDOWN + 20);
    // The scheduler does not convert preparation failure to a busy/error edge,
    // and selection did not dequeue the durable row.
    expect(scheduler.getStatus(s.id).state).toBe("idle");
    expect(await store.listQueuedMessages(s.id)).toHaveLength(1);
  });

  it("replays one enqueue kick received during failed async preparation", async () => {
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let attempts = 0;
    const drain = vi.fn<SessionSchedulerDeps["drain"]>(
      async (_sessionId, _messageId) => {
        attempts += 1;
        if (attempts === 1) {
          markEntered();
          await held;
        }
        throw new Error("provider preparation failed");
      }
    );
    const { scheduler } = makeScheduler(drain);
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "first" });

    scheduler.notifyEnqueued(s.id);
    await entered;
    await store.appendQueuedMessage(s.id, { id: "q2", text: "second" });
    scheduler.notifyEnqueued(s.id);
    release();

    // The first failure replays the coalesced enqueue edge, even though the
    // queue head remains q1. The second failure has no newer edge and pauses,
    // proving this is a one-shot replay rather than an error retry loop.
    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(2));
    expect(drain.mock.calls).toEqual([
      [s.id, "q1"],
      [s.id, "q1"],
    ]);
    expect(
      (await store.listQueuedMessages(s.id)).map((message) => message.id)
    ).toEqual(["q1", "q2"]);
    await delay(2 * COOLDOWN + 20);
    expect(drain).toHaveBeenCalledTimes(2);
  });

  it("reclassifies a late human block when drain declines the queued head", async () => {
    let pendingChecks = 0;
    const drain = vi.fn<SessionSchedulerDeps["drain"]>(async () => false);
    const { scheduler } = makeScheduler(drain, async () => {
      pendingChecks += 1;
      return pendingChecks === 1 ? null : "approval";
    });
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "wait" });

    scheduler.notifyEnqueued(s.id);
    await vi.waitFor(() =>
      expect(scheduler.getStatus(s.id).state).toBe("waiting_on_approval")
    );
    expect(drain).toHaveBeenCalledTimes(1);
    expect(
      (await store.listQueuedMessages(s.id)).map((message) => message.id)
    ).toEqual(["q1"]);

    // Waiting is a stable pause, not a false-claim retry loop.
    await delay(COOLDOWN + 10);
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it("a cancel during async preparation wins the later conditional claim", async () => {
    let entered!: () => void;
    const preparing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    let scheduler!: SessionScheduler;
    scheduler = new SessionScheduler({
      list_queued: (sid) => store.listQueuedMessages(sid),
      drain: async (sid, messageId) => {
        entered();
        await gate;
        if (!store.claimQueuedMessage(sid, messageId)) return false;
        calls.push(messageId);
        scheduler.onCreate(sid);
        return true;
      },
      pending_human_input_kind: async () => null,
      drain_cooldown_ms: COOLDOWN,
    });
    live.push(scheduler);
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "x" });

    scheduler.notifyEnqueued(s.id);
    await preparing;
    expect((await store.listQueuedMessages(s.id)).map((m) => m.id)).toEqual([
      "q1",
    ]);
    await store.deleteMessage(s.id, "q1");
    release();

    await delay(COOLDOWN + 20);
    expect(calls).toEqual([]);
    expect(await store.getMessage("q1")).toMatchObject({
      metadata: { queue_canceled_at: expect.any(Number) },
      hidden_at: expect.any(Number),
    });
    expect(await store.listQueuedMessages(s.id)).toEqual([]);
  });

  it("does not drain when the queue is empty (stays idle, no fire)", async () => {
    const { scheduler, calls } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");
    await delay(COOLDOWN + 20);
    expect(calls).toEqual([]);
    expect(scheduler.getStatus(s.id).state).toBe("idle");
  });

  it("notifyEnqueued kicks a drain when a row arrives while idle (stale-busy race)", async () => {
    // The client enqueues believing the session is busy, but the turn had just
    // ended (the idle status frame was still in flight). With no turn-end edge
    // left to drain it, nothing would ever fire this row — notifyEnqueued does.
    const { scheduler, calls } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "late" });

    scheduler.notifyEnqueued(s.id);
    // Still queued right after (the cooldown timer is a fresh task — no race).
    expect((await store.listQueuedMessages(s.id)).map((m) => m.id)).toEqual([
      "q1",
    ]);
    expect(calls).toEqual([]);
    await delay(COOLDOWN + 20);
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
    expect(calls).toEqual([s.id]); // claimed + fired at fire time
  });

  it("notifyEnqueued is a no-op while busy — the turn-end edge drains", async () => {
    const { scheduler, calls } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    scheduler.onCreate(s.id); // busy
    await store.appendQueuedMessage(s.id, { id: "q1", text: "x" });

    scheduler.notifyEnqueued(s.id);
    await delay(COOLDOWN + 10);
    expect(calls).toEqual([]); // not fired — still busy
    expect(await store.listQueuedMessages(s.id)).toHaveLength(1); // still queued
  });
});
