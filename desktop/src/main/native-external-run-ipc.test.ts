// GRIDA-SEC-004 — exact frame and run observations for external peer controls.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { NativeExternalRun } from "@grida/desktop-bridge";
import { expect, it, vi } from "vitest";
import { NativeExternalRunIpc } from "./native-external-run-ipc";

const ORIGIN = "https://editor.fixture.invalid";
const URL = ORIGIN + "/desktop/workspace?id=selected";

function frame(url = URL) {
  const mainFrame = { url };
  const sender = Object.assign(new EventEmitter(), {
    mainFrame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
  }) as unknown as WebContents;
  return {
    mainFrame,
    sender,
    event: { sender, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent,
  };
}

function run(runId: string): NativeExternalRun {
  return {
    runId,
    disposition: "running",
    text: null,
    responseTruncated: false,
    cleanupVerified: false,
  };
}

function fixture() {
  const first = frame();
  const second = frame();
  const id = randomUUID();
  const latest = vi.fn<() => Promise<NativeExternalRun | null>>(async () =>
    run(id)
  );
  const start = vi.fn<
    (
      id: string,
      text: string,
      current: () => void
    ) => Promise<NativeExternalRun>
  >(async (id, _text, current) => {
    current();
    return run(id);
  });
  const stop = vi.fn<(id: string) => Promise<NativeExternalRun>>(
    async (id) => ({
      ...run(id),
      disposition: "cancelled",
      cleanupVerified: true,
    })
  );
  const owner = {
    selection: { name: "Reviewed peer", workspaceId: "selected" },
    latest,
    start,
    stop,
  };
  const admission = new Set([first.sender, second.sender]);
  let active: typeof owner | undefined = owner;
  const ipc = new NativeExternalRunIpc(
    ORIGIN,
    (sender) => admission.has(sender),
    () => active
  );
  return {
    ipc,
    first,
    second,
    id,
    owner,
    admission,
    withdraw: () => {
      active = undefined;
    },
  };
}

it("projects availability only for the selected authenticated top frame", async () => {
  const { ipc, first, second, id, owner, admission, withdraw } = fixture();
  expect(await ipc.status(first.event)).toEqual({
    name: "Reviewed peer",
    run: run(id),
  });
  admission.delete(second.sender);
  expect(await ipc.status(second.event)).toBeNull();
  expect(
    await ipc.status({ ...first.event, senderFrame: { url: URL } as never })
  ).toBeNull();
  first.mainFrame.url = URL + "&id=selected";
  expect(await ipc.status(first.event)).toBeNull();
  first.mainFrame.url = ORIGIN + "/desktop/workspace?id=another";
  await expect(ipc.start(first.event, id, "test")).rejects.toThrow(
    "native_external_scope_changed"
  );
  expect(owner.start).not.toHaveBeenCalled();
  first.mainFrame.url = URL;
  withdraw();
  expect(await ipc.status(first.event)).toBeNull();
});

it("binds Stop to a run observed on the current frame", async () => {
  const { ipc, first, second, id, owner } = fixture();
  await expect(ipc.stop(first.event, id)).rejects.toThrow(
    "native_external_observation_changed"
  );
  await ipc.status(first.event);
  expect(
    await ipc.status({ ...first.event, senderFrame: { url: URL } as never })
  ).toBeNull();
  expect(await ipc.stop(first.event, id)).toMatchObject({
    runId: id,
    disposition: "cancelled",
  });
  await expect(ipc.stop(second.event, id)).rejects.toThrow(
    "native_external_observation_changed"
  );
  await expect(ipc.stop(first.event, randomUUID())).rejects.toThrow(
    "native_external_observation_changed"
  );
  first.sender.emit("did-start-navigation", { isMainFrame: true });
  await expect(ipc.stop(first.event, id)).rejects.toThrow(
    "native_external_observation_changed"
  );
  const next = randomUUID();
  await ipc.start(first.event, next, "Inspect the outline.");
  expect(await ipc.stop(first.event, next)).toMatchObject({
    runId: next,
    disposition: "cancelled",
  });
  expect(owner.stop.mock.calls).toEqual([[id], [next]]);
});

it("withdraws an in-flight frame before launch and projects only safe errors", async () => {
  const { ipc, first, id, owner } = fixture();
  const waiting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let dispatched = false;
  owner.start.mockImplementationOnce(async (id, _text, current) => {
    waiting.resolve();
    await release.promise;
    current();
    dispatched = true;
    return run(id);
  });
  const pending = ipc.start(first.event, id, "Inspect the outline.");
  const rejected = pending.catch((error: unknown) => error);
  await waiting.promise;
  first.sender.emit("did-navigate-in-page", {}, URL, true);
  release.resolve();
  expect(await rejected).toEqual(new Error("native_external_scope_changed"));
  expect(dispatched).toBe(false);
  owner.latest.mockRejectedValueOnce(new Error("/private/system/error"));
  await expect(ipc.status(first.event)).rejects.toThrow(
    "native_external_unavailable"
  );
});
