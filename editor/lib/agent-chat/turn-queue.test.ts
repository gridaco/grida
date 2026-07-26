/**
 * Contract tests for the turn-queue decision core (RFC
 * docs/wg/ai/agent/queue.md). The DRAIN is CORE state now — its FIFO / serial /
 * "Stop drains the next" / "a hard error pauses" behavior is the
 * `SessionScheduler`'s contract (see
 * `packages/grida-ai-agent/src/runtime/session-scheduler.test.ts`). What stays
 * the host's decision, and is pinned here, is the one client rule:
 *
 *   - what counts as client-local "busy" (incl. an in-flight compaction), and
 *   - a submit while busy ENQUEUES rather than starting a second turn, and
 *   - a submit while awaiting human input ENQUEUES without pretending a run is
 *     busy.
 *
 * If any regresses, these fail — the system hard-fails here rather than only
 * in a hard-to-reproduce desktop session.
 */

import { describe, expect, it } from "vitest";
import {
  decideSubmit,
  isHumanInputPendingState,
  isSessionBusy,
  shouldUseLocalHumanInput,
} from "./turn-queue";

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

describe("isHumanInputPendingState", () => {
  it("recognizes both authoritative waiting states", () => {
    expect(isHumanInputPendingState("waiting_on_approval")).toBe(true);
    expect(isHumanInputPendingState("waiting_on_user_input")).toBe(true);
  });

  it.each(["idle", "busy", "retrying", "error"] as const)(
    "does not conflate %s with pending human input",
    (state) => {
      expect(isHumanInputPendingState(state)).toBe(false);
    }
  );

  it("treats an absent status as unblocked", () => {
    expect(isHumanInputPendingState(null)).toBe(false);
    expect(isHumanInputPendingState(undefined)).toBe(false);
  });
});

describe("shouldUseLocalHumanInput", () => {
  it("uses the transcript while authoritative status is unavailable", () => {
    expect(shouldUseLocalHumanInput(null, "waiting_on_approval")).toBe(true);
    expect(shouldUseLocalHumanInput(undefined, "waiting_on_user_input")).toBe(
      true
    );
  });

  it("preserves transcript controls for a released legacy sidecar", () => {
    expect(
      shouldUseLocalHumanInput({ state: "idle" }, "waiting_on_approval")
    ).toBe(true);
    expect(
      shouldUseLocalHumanInput({ state: "busy" }, "waiting_on_user_input")
    ).toBe(true);
  });

  it("keeps only a control matching the authoritative waiting kind", () => {
    expect(
      shouldUseLocalHumanInput(
        {
          state: "waiting_on_approval",
          human_input_state_authoritative: true,
        },
        "waiting_on_approval"
      )
    ).toBe(true);
    expect(
      shouldUseLocalHumanInput(
        {
          state: "waiting_on_user_input",
          human_input_state_authoritative: true,
        },
        "waiting_on_approval"
      )
    ).toBe(false);
  });

  it.each(["idle", "busy", "retrying", "error"] as const)(
    "suppresses stale transcript controls while core state is %s",
    (state) => {
      const status = {
        state,
        human_input_state_authoritative: true as const,
      };
      expect(shouldUseLocalHumanInput(status, "waiting_on_approval")).toBe(
        false
      );
      expect(shouldUseLocalHumanInput(status, "waiting_on_user_input")).toBe(
        false
      );
    }
  );
});

describe("decideSubmit — enqueue vs. send now", () => {
  it("sends when the session is idle", () => {
    expect(decideSubmit({ busy: false, admissionBlocked: false })).toBe("send");
  });

  it("enqueues while the session is busy", () => {
    expect(decideSubmit({ busy: true, admissionBlocked: false })).toBe(
      "enqueue"
    );
  });

  it("enqueues while a compaction is in flight", () => {
    const busy = isSessionBusy("ready", /* compacting */ true);
    expect(decideSubmit({ busy, admissionBlocked: false })).toBe("enqueue");
  });

  it("enqueues behind pending human input without conflating it with run-busy", () => {
    const busy = isSessionBusy("ready", false);

    expect(busy).toBe(false);
    expect(decideSubmit({ busy, admissionBlocked: true })).toBe("enqueue");
  });

  it("after a hard error the session is idle — a submit sends (breaks the pause)", () => {
    // The core drain pauses on error, but a NEW user submit must still fire —
    // it is the "next fired turn" that clears the error and resumes the drain.
    const busy = isSessionBusy("error", false);
    expect(decideSubmit({ busy, admissionBlocked: false })).toBe("send");
  });
});
