// GRIDA-SEC-008 — stale status reads cannot restore an older account state.
import type { ChatGptSubscriptionStatus } from "@grida/agent";
import type { ChatGptConnectResult } from "@grida/desktop-bridge";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: vi.fn<() => Promise<ChatGptSubscriptionStatus>>(),
  connect: vi.fn<() => Promise<ChatGptConnectResult>>(),
  cancel: vi.fn<() => Promise<void>>(),
  signOut: vi.fn<() => Promise<ChatGptSubscriptionStatus>>(),
  state: { supported: true },
}));

vi.mock("@/lib/desktop/bridge", () => ({
  chatgpt: {
    isSupported: () => mocks.state.supported,
    status: mocks.status,
    connect: mocks.connect,
    cancel: mocks.cancel,
    signOut: mocks.signOut,
  },
}));

import * as subscription from "./chatgpt-subscription";

const signedOut = {
  configured: true,
  signed_in: false,
  ready: false,
  signing_in: false,
};
const signedIn = {
  configured: true,
  signed_in: true,
  ready: true,
  signing_in: false,
  account: { email: "user@example.com", plan: "plus" },
};

beforeEach(() => {
  mocks.state.supported = true;
  mocks.status.mockReset().mockResolvedValue(signedOut);
  mocks.connect.mockReset().mockResolvedValue(signedIn);
  mocks.cancel.mockReset().mockResolvedValue(undefined);
  mocks.signOut.mockReset().mockResolvedValue(signedOut);
  subscription.__unsafe_reset_for_tests();
});

describe("ChatGPT subscription state", () => {
  it("shares one status request and caches only the safe DTO", async () => {
    const [a, b] = await Promise.all([
      subscription.refresh(),
      subscription.refresh(),
    ]);
    expect(mocks.status).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(subscription.peek()).toEqual({ kind: "ready", status: signedOut });
  });

  it("warms the ready cache after browser sign-in", async () => {
    await subscription.connect();
    expect(subscription.isReady()).toBe(true);
    expect(JSON.stringify(subscription.peek())).not.toContain("access_token");
  });

  it("treats a cancelled browser sign-in as a normal signed-out state", async () => {
    mocks.connect.mockResolvedValueOnce({ outcome: "cancelled" });

    await expect(subscription.connect()).resolves.toEqual({
      kind: "ready",
      status: signedOut,
    });
    expect(mocks.status).toHaveBeenCalledOnce();
    expect(subscription.peek()).toEqual({ kind: "ready", status: signedOut });
  });

  it("still surfaces non-cancellation sign-in failures", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("OAuth provider failed"));

    await expect(subscription.connect()).rejects.toThrow(
      "OAuth provider failed"
    );
    expect(subscription.peek()).toEqual({
      kind: "error",
      message: "OAuth provider failed",
    });
  });

  it("clears readiness after sign-out", async () => {
    await subscription.connect();
    await subscription.signOut();
    expect(subscription.isReady()).toBe(false);
  });

  it("does not let an older status read overwrite a completed sign-in", async () => {
    const status = deferred<typeof signedOut>();
    mocks.status.mockReturnValueOnce(status.promise);
    const staleRefresh = subscription.refresh();
    await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledOnce());

    await subscription.connect();
    status.resolve(signedOut);
    await staleRefresh;

    expect(subscription.peek()).toEqual({ kind: "ready", status: signedIn });
  });

  it("does not let an older status read restore readiness after sign-out", async () => {
    await subscription.connect();
    const status = deferred<typeof signedIn>();
    mocks.status.mockReturnValueOnce(status.promise);
    const staleRefresh = subscription.refresh();
    await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledOnce());

    await subscription.signOut();
    status.resolve(signedIn);
    await staleRefresh;

    expect(subscription.peek()).toEqual({ kind: "ready", status: signedOut });
  });

  it("degrades cleanly when the Desktop bridge predates the feature", async () => {
    mocks.state.supported = false;
    expect((await subscription.refresh()).kind).toBe("unsupported");
    expect(mocks.status).not.toHaveBeenCalled();
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
