import type {
  DesktopNativeExternalAgent,
  NativeExternalRun,
  NativeExternalStatus,
} from "@grida/desktop-bridge";
import { afterEach, expect, it, vi } from "vitest";
import { NativeExternalAgentController } from "./native-external-agent-controller";

function run(
  runId: string,
  disposition: NativeExternalRun["disposition"] = "running",
  cleanupVerified = false
): NativeExternalRun {
  return {
    runId,
    disposition,
    text: null,
    responseTruncated: false,
    cleanupVerified,
  };
}

function fixture(
  initial: NativeExternalStatus | null = { name: "Reviewed peer", run: null }
) {
  let status = initial;
  const bridge = {
    status: vi.fn<DesktopNativeExternalAgent["status"]>(async () => status),
    start: vi.fn<DesktopNativeExternalAgent["start"]>(async (id) => {
      const accepted = run(id);
      status = { name: "Reviewed peer", run: accepted };
      return accepted;
    }),
    stop: vi.fn<DesktopNativeExternalAgent["stop"]>(async (id) => {
      const stopped = run(id, "cancelled", true);
      status = { name: "Reviewed peer", run: stopped };
      return stopped;
    }),
  };
  const controller = new NativeExternalAgentController(bridge);
  return {
    bridge,
    controller,
    observe: (next: typeof status) => {
      status = next;
    },
  };
}

async function open(controller: NativeExternalAgentController) {
  controller.connect();
  await Promise.resolve();
  controller.setOpen(true);
  await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

it("keeps an unavailable workspace hidden and makes a failed observation retryable", async () => {
  const { bridge, controller, observe } = fixture(null);
  await open(controller);
  expect(controller.read()).toMatchObject({
    status: null,
    open: false,
    error: null,
  });
  bridge.status.mockRejectedValueOnce(
    new Error("older process still owns the store")
  );
  await controller.refresh();
  expect(controller.read()).toMatchObject({
    status: null,
    open: false,
    error: expect.any(String),
  });
  observe({ name: "Reviewed peer", run: run("retained", "succeeded", true) });
  await controller.refresh();
  expect(controller.read().status?.run).toMatchObject({
    runId: "retained",
    disposition: "succeeded",
  });
  expect(bridge.start).not.toHaveBeenCalled();
  controller.disconnect();
});

it("observes a retained run and stops only its exact identity after reopening the dialog", async () => {
  vi.useFakeTimers();
  const { bridge, controller } = fixture({
    name: "Reviewed peer",
    run: run("active"),
  });
  await open(controller);
  await vi.advanceTimersByTimeAsync(700);
  expect(controller.canStop).toBe(true);
  expect(bridge.status).toHaveBeenCalledTimes(3);
  controller.setOpen(false);
  await vi.advanceTimersByTimeAsync(1800);
  expect(bridge.status).toHaveBeenCalledTimes(3);
  expect(bridge.stop).not.toHaveBeenCalled();
  controller.setOpen(true);
  await Promise.resolve();
  await controller.stop("stale");
  expect(bridge.stop).not.toHaveBeenCalled();
  await controller.stop("active");
  expect(bridge.stop).toHaveBeenCalledExactlyOnceWith("active");
  expect(controller.read().status?.run).toMatchObject({
    disposition: "cancelled",
    cleanupVerified: true,
  });
  expect(bridge.start).not.toHaveBeenCalled();
  controller.disconnect();
});

it("keeps a lost reply's exact UUID and draft until an explicit retry", async () => {
  vi.useFakeTimers();
  const { bridge, controller } = fixture();
  await open(controller);
  bridge.start.mockRejectedValueOnce(new Error("reply unavailable"));
  controller.changeDraft("Inspect the local outline.");
  await controller.start();
  const captured = bridge.start.mock.calls[0];
  expect(captured).toEqual([expect.any(String), "Inspect the local outline."]);
  expect(controller.read()).toMatchObject({
    draft: captured[1],
    pending: true,
    error: expect.any(String),
  });
  controller.changeDraft("Replace the uncertain input.");
  controller.setOpen(false);
  controller.setOpen(true);
  await vi.advanceTimersByTimeAsync(1800);
  expect(bridge.start).toHaveBeenCalledTimes(1);
  await controller.start();
  expect(bridge.start.mock.calls[1]).toEqual(captured);
  expect(controller.read()).toMatchObject({
    draft: "",
    pending: false,
    error: null,
  });
  controller.disconnect();
});

it("recovers an accepted request from status without sending it again", async () => {
  const { bridge, controller, observe } = fixture();
  await open(controller);
  bridge.start.mockImplementationOnce(async (id) => {
    observe({ name: "Reviewed peer", run: run(id, "succeeded", true) });
    throw new Error("reply unavailable");
  });
  controller.changeDraft("Inspect the local outline.");
  await controller.start();
  expect(controller.read()).toMatchObject({
    draft: "",
    pending: false,
    error: null,
    status: {
      run: { runId: bridge.start.mock.calls[0][0], disposition: "succeeded" },
    },
  });
  expect(bridge.start).toHaveBeenCalledTimes(1);
  controller.disconnect();
});

it("reopens the exact cancelled receipt after losing the Stop reply", async () => {
  const { bridge, controller, observe } = fixture({
    name: "Reviewed peer",
    run: run("active"),
  });
  await open(controller);
  bridge.stop.mockImplementationOnce(async (id) => {
    observe({ name: "Reviewed peer", run: run(id, "cancelled", true) });
    throw new Error("reply unavailable");
  });
  await controller.stop("active");
  expect(controller.read()).toMatchObject({
    error: null,
    status: { run: { runId: "active", disposition: "cancelled" } },
  });
  expect(bridge.stop).toHaveBeenCalledExactlyOnceWith("active");
  expect(bridge.start).not.toHaveBeenCalled();
  controller.disconnect();
});

it("keeps uncertainty and blocks replacement until the owner verifies cleanup", async () => {
  const { bridge, controller, observe } = fixture({
    name: "Reviewed peer",
    run: run("retained", "uncertain"),
  });
  await open(controller);
  controller.changeDraft("Inspect the local outline.");
  expect(controller.canRun).toBe(false);
  await controller.start();
  expect(bridge.start).not.toHaveBeenCalled();
  observe({ name: "Reviewed peer", run: run("retained", "uncertain", true) });
  await controller.refresh();
  expect(controller.read().status?.run).toMatchObject({
    disposition: "uncertain",
    cleanupVerified: true,
  });
  expect(controller.canRun).toBe(true);
  expect(bridge.start).not.toHaveBeenCalled();
  controller.disconnect();
});

it("does not erase text when an observed request never dispatched", async () => {
  const { bridge, controller } = fixture();
  await open(controller);
  bridge.start.mockImplementationOnce(async (id) => run(id, "not_dispatched"));
  controller.changeDraft("Keep this draft.");
  await controller.start();
  expect(controller.read()).toMatchObject({
    draft: "Keep this draft.",
    pending: false,
  });
  expect(controller.canRun).toBe(true);
  await controller.start();
  expect(bridge.start.mock.calls[0][0]).not.toBe(bridge.start.mock.calls[1][0]);
  controller.disconnect();
});

it("discards a late observation when the workspace view disconnects", async () => {
  const { bridge, controller } = fixture();
  const waiting = Promise.withResolvers<NativeExternalStatus>();
  bridge.status.mockReturnValueOnce(waiting.promise);
  controller.connect();
  controller.disconnect();
  waiting.resolve({ name: "Previous workspace", run: run("old") });
  await waiting.promise;
  expect(controller.read()).toMatchObject({ status: null, open: false });
  expect(bridge.start).not.toHaveBeenCalled();
  expect(bridge.stop).not.toHaveBeenCalled();
});
