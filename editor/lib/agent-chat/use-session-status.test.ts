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
 * stream cancel → run abort. The fix: a real core drain ALWAYS has a queued
 * head; with no head, the edge is NOT a drain and must be ignored.
 */

import { describe, expect, it } from "vitest";
import { coreTurnSyncAction, type CoreRunState } from "./use-session-status";
import type { ChatMessageWithParts } from "@/lib/desktop/bridge";

// The decision only reads `id` off the queued head.
function head(id: string): ChatMessageWithParts {
  return { id } as unknown as ChatMessageWithParts;
}

const base = {
  coreState: "busy" as CoreRunState | null,
  prevState: "idle" as CoreRunState | null,
  isStreaming: false,
  queuedHead: undefined as ChatMessageWithParts | undefined,
};

describe("coreTurnSyncAction", () => {
  it("THE FIX: bare busy edge with NO queued head is ignored (the resume cut-off)", () => {
    // idle→busy, this client didn't flip `isStreaming` yet, but the tray is
    // empty: it's the client's own approval-resume send, NOT a core drain.
    expect(coreTurnSyncAction({ ...base, queuedHead: undefined })).toEqual({
      type: "ignore",
    });
  });

  it("a real drain (busy edge + queued head) attaches and promotes the head", () => {
    expect(coreTurnSyncAction({ ...base, queuedHead: head("m1") })).toEqual({
      type: "drain",
      fired: head("m1"),
    });
  });

  it("a turn THIS client started (isStreaming) is ignored even with a queued head", () => {
    expect(
      coreTurnSyncAction({ ...base, isStreaming: true, queuedHead: head("m1") })
    ).toEqual({ type: "ignore" });
  });

  it("the mount frame (prevState null) is ignored — resume:true covers it", () => {
    expect(
      coreTurnSyncAction({ ...base, prevState: null, queuedHead: head("m1") })
    ).toEqual({ type: "ignore" });
  });

  it("a non-busy target (busy→idle) is ignored", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        prevState: "busy",
        coreState: "idle",
        queuedHead: head("m1"),
      })
    ).toEqual({ type: "ignore" });
  });

  it("a repeat of the same state (no transition) is ignored", () => {
    expect(
      coreTurnSyncAction({
        ...base,
        prevState: "busy",
        coreState: "busy",
        queuedHead: head("m1"),
      })
    ).toEqual({ type: "ignore" });
  });

  it("a null coreState is ignored", () => {
    expect(
      coreTurnSyncAction({ ...base, coreState: null, queuedHead: head("m1") })
    ).toEqual({ type: "ignore" });
  });
});
