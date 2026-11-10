import { afterEach, expect, it, vi } from "vitest";
import type { NativeChatNotificationFocus } from "@grida/desktop-bridge";
import {
  DESKTOP_AGENT_FOCUS_SESSION_EVENT,
  subscribeToNativeNotificationFocus,
} from "./agent-focus-session";

const workspaceId = "eac20941e6a410aa";
const profileId = "b".repeat(64);
const target = { sessionId: "saved-chat", profileId };
type Focus = (sessionId: string, profileId?: string) => void;
type TakeFocus = () => Promise<NativeChatNotificationFocus | null>;

function workbench() {
  const events = new EventTarget();
  const browser = Object.assign(events, {
    location: new URL(
      `https://editor.fixture.invalid/desktop/workspace?id=${workspaceId}`
    ),
    wake(detail: unknown = { session_id: "untrusted-window-event" }) {
      events.dispatchEvent(
        new CustomEvent(DESKTOP_AGENT_FOCUS_SESSION_EVENT, { detail })
      );
    },
  });
  vi.stubGlobal("window", browser);
  return browser;
}

afterEach(() => vi.unstubAllGlobals());

it("takes a click after mounting without needing the earlier push", async () => {
  workbench();
  const focus = vi.fn<Focus>();
  const takeNotificationFocus = vi.fn<TakeFocus>(async () => target);
  const stop = subscribeToNativeNotificationFocus(
    { takeNotificationFocus },
    workspaceId,
    focus
  );
  await vi.waitFor(() =>
    expect(focus).toHaveBeenCalledExactlyOnceWith(target.sessionId, profileId)
  );
  expect(takeNotificationFocus).toHaveBeenCalledOnce();
  stop();
});

it("takes only once across a synchronous mount and cleanup probe", async () => {
  workbench();
  const beforeMount = vi.fn<Focus>();
  const focus = vi.fn<Focus>();
  const bridge = {
    takeNotificationFocus: vi.fn<TakeFocus>(async () => target),
  };
  subscribeToNativeNotificationFocus(bridge, workspaceId, beforeMount)();
  const stop = subscribeToNativeNotificationFocus(bridge, workspaceId, focus);
  await vi.waitFor(() =>
    expect(focus).toHaveBeenCalledExactlyOnceWith(target.sessionId, profileId)
  );
  expect(beforeMount).not.toHaveBeenCalled();
  expect(bridge.takeNotificationFocus).toHaveBeenCalledOnce();
  stop();
});

it("coalesces clicks while a take is in flight and ignores raw wake payloads", async () => {
  const browser = workbench();
  const focus = vi.fn<Focus>();
  const first = Promise.withResolvers<NativeChatNotificationFocus | null>();
  const takeNotificationFocus = vi.fn<TakeFocus>();
  takeNotificationFocus
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(target);
  const stop = subscribeToNativeNotificationFocus(
    { takeNotificationFocus },
    workspaceId,
    focus
  );
  await vi.waitFor(() => expect(takeNotificationFocus).toHaveBeenCalledOnce());
  browser.wake();
  browser.wake();
  first.resolve({ sessionId: "older-chat" });
  await vi.waitFor(() =>
    expect(focus).toHaveBeenCalledExactlyOnceWith(target.sessionId, profileId)
  );
  expect(takeNotificationFocus).toHaveBeenCalledTimes(2);
  stop();
});

it.each(["unmount", "navigation", "withdrawal"])(
  "discards an in-flight target after %s",
  async (change) => {
    const browser = workbench();
    const focus = vi.fn<Focus>();
    const reply = Promise.withResolvers<NativeChatNotificationFocus | null>();
    const takeNotificationFocus = vi.fn<TakeFocus>();
    takeNotificationFocus
      .mockReturnValueOnce(reply.promise)
      .mockRejectedValueOnce(new Error("IPC denied"));
    const stop = subscribeToNativeNotificationFocus(
      { takeNotificationFocus },
      workspaceId,
      focus
    );
    await vi.waitFor(() =>
      expect(takeNotificationFocus).toHaveBeenCalledOnce()
    );
    if (change === "unmount") stop();
    if (change === "navigation")
      browser.location.search = "?id=another-workspace";
    browser.wake();
    reply.resolve(target);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(focus).not.toHaveBeenCalled();
    expect(takeNotificationFocus).toHaveBeenCalledTimes(
      change === "withdrawal" ? 2 : 1
    );
    stop();
  }
);

it("accepts the original push format when the shell lacks the native take", () => {
  const browser = workbench();
  const focus = vi.fn<Focus>();
  const stop = subscribeToNativeNotificationFocus({}, workspaceId, focus);
  browser.wake({ session_id: "invalid", profile_id: "bad-profile" });
  browser.wake({ session_id: target.sessionId, profile_id: profileId });
  stop();
  browser.wake();
  expect(focus).toHaveBeenCalledExactlyOnceWith(target.sessionId, profileId);
});
