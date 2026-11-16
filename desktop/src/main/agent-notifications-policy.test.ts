/**
 * Contract pins for the desktop notification policy (RFC
 * `docs/wg/ai/agent/events.md` §the first consumer): which native chat
 * lifecycle facts notify and the silent cases. Exhaustiveness over the
 * settled statuses is enforced at COMPILE time in the policy itself
 * (`silentOnUnknown`), so these pins own the row semantics and the skew
 * fallback, not the enumeration.
 *
 * Pure — no electron; the wiring (window resolution, focus gate,
 * Notification, click routing) lives in `agent-notifications.ts`.
 */
import { describe, expect, it } from "vitest";
import type { NativeChatLifecycle } from "./native-agent-chat";
import {
  agent_notifications,
  FALLBACK_TITLE,
} from "./agent-notifications-policy";

const settled = (
  status: Extract<NativeChatLifecycle, { kind: "settled" }>["status"]
): NativeChatLifecycle => ({
  kind: "settled",
  sessionId: "chat",
  turnId: "turn",
  status,
});

describe("agent_notifications.decideNative — when to notify (RFC events §when-to-notify)", () => {
  it("notifies an access approval wait", () => {
    expect(
      agent_notifications.decideNative({
        kind: "approval_required",
        sessionId: "chat",
        turnId: "turn",
        waitId: "wait",
      })
    ).toEqual({ title: FALLBACK_TITLE, body: "Waiting for your approval" });
  });

  it.each([
    ["succeeded", "Turn completed"],
    ["failed", "Run failed"],
    ["uncertain", "Turn outcome needs review"],
  ] as const)("notifies a %s turn", (status, body) => {
    expect(agent_notifications.decideNative(settled(status))).toEqual({
      title: FALLBACK_TITLE,
      body,
    });
  });

  it("is silent on a cancelled turn — the user did it themselves", () => {
    expect(agent_notifications.decideNative(settled("cancelled"))).toBeNull();
  });

  it("is silent on a status this build does not know (skew fail-quiet)", () => {
    expect(
      agent_notifications.decideNative(settled("timed_out" as never))
    ).toBeNull();
  });
});
