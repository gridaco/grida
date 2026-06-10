/**
 * Contract pins for the desktop notification policy (RFC
 * `docs/wg/ai/agent/events.md` §the first consumer): which lifecycle
 * events notify, the silent cases, and the focus gate. The `decide`
 * suite below mirrors the RFC's §when-to-notify table ROW FOR ROW — if
 * a row changes in one place and not the other, the spec has drifted;
 * fix the drift, not the test. Exhaustiveness over the event vocabulary
 * is enforced at COMPILE time in the policy itself (`silentOnUnknown`),
 * so these pins own the row semantics and the skew fallback, not the
 * enumeration.
 *
 * Pure — no electron; the wiring (SSE loop, window resolution,
 * Notification, click routing) lives in `agent-notifications.ts` and is
 * exercised through the running app.
 */
import { describe, expect, it } from "vitest";
import type { AgentLifecycleEvent } from "@grida/agent";
import {
  agent_notifications,
  FALLBACK_TITLE,
} from "./agent-notifications-policy";

const SESSION: agent_notifications.SessionFacts = {
  title: "Refactor the parser",
  workspace_id: "ws1",
};

const finished = (
  over: Partial<Extract<AgentLifecycleEvent, { type: "turn-finished" }>> = {}
): AgentLifecycleEvent => ({
  type: "turn-finished",
  session_id: "ses1",
  message_id: "m1",
  reason: "finish",
  pending_approval: false,
  at: 1,
  ...over,
});

describe("agent_notifications.decide — when to notify (RFC events §when-to-notify)", () => {
  it("notifies on a clean finish, titled by the session", () => {
    expect(agent_notifications.decide(finished(), SESSION)).toEqual({
      title: "Refactor the parser",
      body: "Turn completed",
    });
  });

  it("notifies on approval-requested — the agent is stalled on the user", () => {
    expect(
      agent_notifications.decide(
        { type: "approval-requested", session_id: "ses1", at: 1 },
        SESSION
      )
    ).toEqual({
      title: "Refactor the parser",
      body: "Waiting for your approval",
    });
  });

  it("notifies on a hard error — the drain is paused; the user must intervene", () => {
    expect(
      agent_notifications.decide(finished({ reason: "error" }), SESSION)
    ).toEqual({
      title: "Refactor the parser",
      body: "Run failed",
    });
  });

  it("is silent on abort — the user did this themselves", () => {
    expect(
      agent_notifications.decide(finished({ reason: "abort" }), SESSION)
    ).toBeNull();
  });

  it("is silent on a BLOCKED finish — the approval-requested event already covers it", () => {
    expect(
      agent_notifications.decide(finished({ pending_approval: true }), SESSION)
    ).toBeNull();
  });

  it("is silent on turn-started — starting is not an attention moment", () => {
    expect(
      agent_notifications.decide(
        { type: "turn-started", session_id: "ses1", message_id: "m1", at: 1 },
        SESSION
      )
    ).toBeNull();
  });

  it("falls back to a generic title when the session row is unreadable or untitled", () => {
    expect(agent_notifications.decide(finished(), null)?.title).toBe(
      FALLBACK_TITLE
    );
    expect(
      agent_notifications.decide(finished(), { ...SESSION, title: "  " })?.title
    ).toBe(FALLBACK_TITLE);
  });

  // Version skew (a newer agent server under an older shell — possible once
  // external backends/daemons emit onto this channel): values this build's
  // vocabulary doesn't know MUST stay silent, never map to a wrong
  // notification. In-repo vocabulary growth is caught at compile time
  // instead (the policy's exhaustive switches).
  it("is silent on an end reason this build does not know (skew fail-quiet)", () => {
    expect(
      agent_notifications.decide(
        finished({ reason: "timeout" as never }),
        SESSION
      )
    ).toBeNull();
  });

  it("is silent on an event type this build does not know (skew fail-quiet)", () => {
    expect(
      agent_notifications.decide(
        { type: "turn-retrying", session_id: "ses1", at: 1 } as never,
        SESSION
      )
    ).toBeNull();
  });
});

describe("agent_notifications.suppressed — the focus gate (RFC events §focus-gating)", () => {
  it("suppresses when the session's window is focused — the user is watching", () => {
    expect(
      agent_notifications.suppressed(SESSION, {
        target_exists: true,
        target_focused: true,
        app_focused: true,
      })
    ).toBe(true);
  });

  it("notifies when the session's window exists but is unfocused — even if another app window is focused", () => {
    expect(
      agent_notifications.suppressed(SESSION, {
        target_exists: true,
        target_focused: false,
        app_focused: true,
      })
    ).toBe(false);
  });

  it("notifies a workspace-bound session with NO window — nobody can be watching it", () => {
    expect(
      agent_notifications.suppressed(SESSION, {
        target_exists: false,
        target_focused: false,
        app_focused: true,
      })
    ).toBe(false);
  });

  it("falls back to app focus for an unbound session", () => {
    const unbound = { title: "Doc chat", workspace_id: null };
    expect(
      agent_notifications.suppressed(unbound, {
        target_exists: false,
        target_focused: false,
        app_focused: true,
      })
    ).toBe(true);
    expect(
      agent_notifications.suppressed(unbound, {
        target_exists: false,
        target_focused: false,
        app_focused: false,
      })
    ).toBe(false);
  });

  it("falls back to app focus when the session row is unreadable", () => {
    expect(
      agent_notifications.suppressed(null, {
        target_exists: false,
        target_focused: false,
        app_focused: false,
      })
    ).toBe(false);
  });
});
