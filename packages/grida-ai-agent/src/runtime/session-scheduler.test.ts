/**
 * Contract tests for the core run-state machine (RFC
 * docs/wg/ai/agent/queue.md + session.md §Session status). These are the
 * executable spec for the behaviors the CORE now owns (moved off the UI):
 *
 *   1. status transitions: create → busy, finish/abort → idle, error → error.
 *   2. SERIAL drain: a clean idle edge fires the earliest queued row, one
 *      turn at a time, FIFO.
 *   3. dequeue happens at SELECTION (before the cooldown) so the row is
 *      visible during the idle cooldown window.
 *   4. a hard error PAUSES the drain; cancel halts the cascade.
 *   5. a single-flight race (drain throws RunInFlightError) is swallowed.
 *   6. status subscription delivers current-then-changes.
 *
 * Uses a real in-memory store for list_queued/dequeue and a fake `drain`; a
 * small real cooldown + `delay()` keeps it deterministic without fake timers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { RunInFlightError } from "./stream-registry";
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
 *  `has_pending_approval` gate defaults to "never blocked" so the existing
 *  drain tests are unaffected; the approval-pause test passes a real flag. */
function makeScheduler(
  drain?: SessionSchedulerDeps["drain"],
  hasPendingApproval?: SessionSchedulerDeps["has_pending_approval"]
): {
  scheduler: SessionScheduler;
  calls: string[];
} {
  const calls: string[] = [];
  let scheduler!: SessionScheduler;
  const defaultDrain: SessionSchedulerDeps["drain"] = async (sid) => {
    calls.push(sid);
    scheduler.onCreate(sid); // a real startTurn would reserve → onCreate
  };
  scheduler = new SessionScheduler({
    list_queued: (sid) => store.listQueuedMessages(sid),
    dequeue: (id) => store.dequeueMessage(id),
    drain: drain ?? defaultDrain,
    has_pending_approval: hasPendingApproval ?? (async () => false),
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

    scheduler.onCreate(s.id);
    expect(scheduler.getStatus(s.id).state).toBe("busy");
    expect(scheduler.getStatus(s.id).started_at).toEqual(expect.any(Number));

    // idle is broadcast synchronously on a clean turn-end (the button flips to
    // Send immediately); the cooldown happens BEFORE the next fire, not before
    // idle.
    scheduler.onFinish(s.id, "finish");
    expect(scheduler.getStatus(s.id).state).toBe("idle");

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "abort");
    expect(scheduler.getStatus(s.id).state).toBe("idle");
  });

  it("subscribe delivers the current status immediately, then on change", () => {
    const { scheduler } = makeScheduler();
    const sid = "ses_sub";
    const seen: string[] = [];
    const unsub = scheduler.subscribe(sid, (st) => seen.push(st.state));
    expect(seen).toEqual(["idle"]); // current, immediately

    scheduler.onCreate(sid);
    scheduler.onFinish(sid, "finish"); // both edges are synchronous
    expect(seen).toEqual(["idle", "busy", "idle"]);

    unsub();
    scheduler.onCreate(sid);
    expect(seen).toEqual(["idle", "busy", "idle"]); // silent after unsubscribe
  });
});

describe("SessionScheduler drain", () => {
  it("keeps the row queued through the cooldown, then dequeues + fires at fire time", async () => {
    const { scheduler, calls } = makeScheduler();
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "queued" });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");
    expect(scheduler.getStatus(s.id).state).toBe("idle"); // idle immediately

    // Right after the idle edge the cooldown timer has NOT fired (it is a fresh
    // task), so the row is STILL queued (visible to the UI as pending) and
    // nothing has fired — it "submits" only when it fires. Asserted within a
    // microtask of onFinish, so it never races the cooldown duration.
    expect((await store.listQueuedMessages(s.id)).map((m) => m.id)).toEqual([
      "q1",
    ]);
    expect(calls).toEqual([]);

    // At fire time (cooldown elapsed): dequeued AND fired together.
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
    // A turn blocked awaiting the user's Allow/Deny is NOT a completed turn
    // (RFC queue § drain-pause). An approval-request finishes the run cleanly,
    // so the session reads idle through the pause — but the queued message must
    // NOT fire until the approval resolves. Without the fire-gate's
    // has_pending_approval check, the cooldown drain would fire `q1` during the
    // wait (the reported B1 bug): drop that check and this assertion fails.
    let pendingApproval = true;
    const { scheduler, calls } = makeScheduler(
      undefined,
      async () => pendingApproval
    );
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "queued" });

    // Turn 1 pauses for approval: clean finish → idle, but an approval pends.
    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");
    expect(scheduler.getStatus(s.id).state).toBe("idle");

    await delay(COOLDOWN + 20);
    expect(calls).toEqual([]); // did NOT fire during the approval pause
    expect((await store.listQueuedMessages(s.id)).map((m) => m.id)).toEqual([
      "q1",
    ]); // still queued

    // User answers; the resume turn runs and reaches a true finish.
    pendingApproval = false;
    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");

    await delay(COOLDOWN + 20);
    expect(calls).toEqual([s.id]); // now the queued head drains, exactly once
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
  });

  it("drains a multi-item queue serially, one turn each, FIFO", async () => {
    const order: string[] = [];
    let scheduler!: SessionScheduler;
    const drain: SessionSchedulerDeps["drain"] = async (sid) => {
      // The just-dequeued head is the latest visible user row.
      const visible = await store.listVisibleMessages(sid);
      order.push(visible.at(-1)!.id);
      scheduler.onCreate(sid);
      setTimeout(() => scheduler.onFinish(sid, "finish"), 3); // settle the turn
    };
    scheduler = new SessionScheduler({
      list_queued: (sid) => store.listQueuedMessages(sid),
      dequeue: (id) => store.dequeueMessage(id),
      drain,
      has_pending_approval: async () => false,
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

    await delay(2 * (COOLDOWN + 25));
    expect(order).toEqual(["a", "b"]); // FIFO, one turn at a time
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
  });

  it("a cancelled queued row never fires (cancel halts the cascade)", async () => {
    const order: string[] = [];
    let scheduler!: SessionScheduler;
    const drain: SessionSchedulerDeps["drain"] = async (sid) => {
      const visible = await store.listVisibleMessages(sid);
      order.push(visible.at(-1)!.id);
      scheduler.onCreate(sid);
      setTimeout(() => scheduler.onFinish(sid, "finish"), 3);
    };
    scheduler = new SessionScheduler({
      list_queued: (sid) => store.listQueuedMessages(sid),
      dequeue: (id) => store.dequeueMessage(id),
      drain,
      has_pending_approval: async () => false,
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

  it("swallows a single-flight RunInFlightError from the drain", async () => {
    const { scheduler } = makeScheduler(async () => {
      throw new RunInFlightError("ses_race");
    });
    const s = await store.create({ agent: "grida" });
    await store.appendQueuedMessage(s.id, { id: "q1", text: "x" });

    scheduler.onCreate(s.id);
    scheduler.onFinish(s.id, "finish");

    await delay(COOLDOWN + 20);
    // The throw did not crash the scheduler or flip status to error (the run
    // that won the race owns the status). The row was committed at selection.
    expect(scheduler.getStatus(s.id).state).toBe("idle");
    expect(await store.listQueuedMessages(s.id)).toHaveLength(0);
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
    expect(calls).toEqual([s.id]); // dequeued + fired at fire time
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
