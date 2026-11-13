// GRIDA-SEC-004 — workspace startup quarantine and exact child exit evidence.
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import type { NativeChatStore } from "./native-chat-store";
import {
  NativeAgentProcess,
  NativeAgentTerminationPending,
} from "./native-agent-process";
import { NativeWorkspaceAgents } from "./native-workspace-agents";

const spawn = vi.hoisted(() => vi.fn<() => ChildProcessWithoutNullStreams>());
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn,
}));
vi.mock("node:timers", async (original) => ({
  ...(await original<typeof import("node:timers")>()),
  setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}));

const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  spawn.mockReset();
  for (const root of directories.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function child(
  version: number,
  options: { closeOnEof?: boolean; closeOnKill?: boolean } = {}
) {
  const events = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const eof = Promise.withResolvers<void>();
  const close = (signal: NodeJS.Signals | null = null) =>
    events.emit("close", signal ? null : 0, signal);
  const kill = vi.fn<(signal: NodeJS.Signals) => boolean>((signal) => {
    if (options.closeOnKill) close(signal);
    return true;
  });
  const stdin = new Writable({
    write(chunk, _encoding, done) {
      const request = JSON.parse(chunk.toString());
      stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: version,
            agentInfo: { name: "grida-agent" },
            agentCapabilities: {
              _meta: request.params.clientCapabilities._meta,
            },
          },
        }) + "\n"
      );
      done();
    },
    final(done) {
      eof.resolve();
      if (options.closeOnEof) close();
      done();
    },
  });
  const handle = Object.assign(events, { stdin, stdout, stderr, kill });
  return {
    handle: handle as unknown as ChildProcessWithoutNullStreams,
    eof: eof.promise,
    close,
    kill,
    events,
  };
}

function fixture() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "grida-native-quarantine-"))
  );
  directories.push(root);
  const resources = path.join(root, "native-agent");
  fs.mkdirSync(resources, { mode: 0o700 });
  fs.writeFileSync(
    path.join(
      resources,
      process.platform === "win32" ? "grida-agent.exe" : "grida-agent"
    ),
    "mocked spawn fixture",
    { mode: 0o700 }
  );
  const stateDirectory = path.join(root, "state");
  const launch = {
    resourcesPath: root,
    provider: "openai-compatible",
    endpoint: "http://127.0.0.1:1/v1",
    model: "fixture",
  } as const;
  const workspace = { id: "workspace", root };
  const store = {
    startWorkspace: async (_id, options) => ({
      chat: await NativeAgentChat.start({ ...options, stateDirectory }),
      stateDirectory,
    }),
  } satisfies Pick<NativeChatStore, "startWorkspace">;
  const release = vi.fn<() => void>();
  const signals: AbortSignal[] = [];
  const owners = new NativeWorkspaceAgents(store, async (_, signal) => {
    signals.push(signal);
    return { launch, release };
  });
  return {
    launch: { ...launch, stateDirectory },
    workspace,
    owners,
    release,
    signals,
  };
}

it("retires the exited worker's callbacks before admitting a replacement", async () => {
  const { workspace, owners, signals } = fixture();
  const exited = child(1, { closeOnEof: true });
  spawn
    .mockReturnValueOnce(exited.handle)
    .mockReturnValueOnce(child(1, { closeOnEof: true }).handle);
  try {
    await owners.open(workspace);
    exited.close("SIGKILL");
    expect(owners.current(workspace.id)).toBeNull();
    await owners.open(workspace);
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  } finally {
    await owners.close();
  }
});

it("keeps a live native worker bound to its selected directory generation", async () => {
  const { workspace, owners } = fixture();
  const ready = child(1, { closeOnEof: true });
  spawn.mockReturnValueOnce(ready.handle);
  const identity = { device: "1", inode: "2", birthTimeNs: "3" };
  try {
    const active = await owners.open({ ...workspace, identity });
    expect(active.directoryIdentity).toEqual(identity);
    await expect(
      owners.open({ ...workspace, identity: { ...identity, inode: "4" } })
    ).rejects.toThrow("native_workspace_root_changed");
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally {
    await owners.close();
  }
});

it("keeps all live provider profiles on the same workspace generation", async () => {
  const { launch, workspace, owners } = fixture();
  const identity = { device: "1", inode: "2", birthTimeNs: "3" };
  const otherIdentity = { ...identity, inode: "4" };
  const first = child(1, { closeOnEof: true });
  const second = child(1, { closeOnEof: true });
  const saved = {
    id: "saved",
    prepare: vi.fn<() => Promise<{ launch: typeof launch }>>(async () => ({
      launch,
    })),
  };
  spawn.mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
  try {
    await owners.open({ ...workspace, identity });
    await expect(
      owners.open({ ...workspace, identity: otherIdentity }, saved)
    ).rejects.toThrow("native_workspace_root_changed");
    expect(saved.prepare).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(1);
    await owners.open({ ...workspace, identity }, saved);
    expect(saved.prepare).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledTimes(2);
  } finally {
    await owners.close();
  }
});

it("rejects a different workspace generation while another profile is starting", async () => {
  const { launch, workspace, owners } = fixture();
  const identity = { device: "1", inode: "2", birthTimeNs: "3" };
  const preparing = Promise.withResolvers<void>();
  const prepared = Promise.withResolvers<{ launch: typeof launch }>();
  const first = {
    id: "first",
    prepare: () => {
      preparing.resolve();
      return prepared.promise;
    },
  };
  const second = {
    id: "second",
    prepare: vi.fn<() => Promise<{ launch: typeof launch }>>(async () => ({
      launch,
    })),
  };
  spawn.mockReturnValueOnce(child(1, { closeOnEof: true }).handle);
  try {
    const opening = owners.open({ ...workspace, identity }, first);
    await preparing.promise;
    await expect(
      owners.open(
        { ...workspace, identity: { ...identity, inode: "4" } },
        second
      )
    ).rejects.toThrow("native_workspace_root_changed");
    expect(second.prepare).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    prepared.resolve({ launch });
    await opening;
    expect(spawn).toHaveBeenCalledOnce();
  } finally {
    prepared.resolve({ launch });
    await owners.close();
  }
});

it("keeps one worker per workspace store and drains it on Forget without touching other workspaces", async () => {
  const { launch, workspace, owners } = fixture();
  const ordinary = child(1);
  const saved = child(1);
  const otherChild = child(1, { closeOnEof: true });
  const replacement = child(1, { closeOnEof: true });
  spawn
    .mockReturnValueOnce(ordinary.handle)
    .mockReturnValueOnce(saved.handle)
    .mockReturnValueOnce(otherChild.handle)
    .mockReturnValueOnce(replacement.handle);
  const other = { ...workspace, id: "other" };
  const profile = { id: "saved", prepare: async () => ({ launch }) };
  try {
    const original = await owners.open(workspace);
    // Choosing another connection retires the default worker before the
    // saved route opens the same workspace store.
    const switching = owners.open(workspace, profile);
    await ordinary.eof;
    expect(spawn).toHaveBeenCalledTimes(1);
    ordinary.close();
    const selected = await switching;
    expect(selected).not.toBe(original);
    expect(owners.current(workspace.id)).toBeNull();
    expect(owners.current(workspace.id, profile.id)).toBe(selected);
    const retained = await owners.open(other);
    const forgotten = owners.closeWorkspace(workspace.id);
    expect(owners.current(workspace.id, profile.id)).toBeNull();
    expect(owners.current(other.id)).toBe(retained);
    await saved.eof;
    await expect(owners.open(workspace)).rejects.toThrow(
      "native_workspace_closing"
    );
    expect(spawn).toHaveBeenCalledTimes(3);
    saved.close();
    await forgotten;
    const reopened = await owners.open(workspace);
    expect(owners.current(workspace.id)).toBe(reopened);
    expect(owners.current(other.id)).toBe(retained);
  } finally {
    ordinary.close();
    saved.close();
    await owners.close();
  }
});

it("invalidates a captured launch before it can spawn after Forget", async () => {
  const { launch, workspace, owners, release } = fixture();
  const preparing = Promise.withResolvers<AbortSignal>();
  const prepared = Promise.withResolvers<{
    launch: typeof launch;
    release: typeof release;
  }>();
  const opening = owners
    .open(workspace, {
      id: "saved",
      prepare: (signal) => {
        preparing.resolve(signal);
        return prepared.promise;
      },
    })
    .catch((error: unknown) => error);
  const signal = await preparing.promise;
  const forgotten = owners.closeWorkspace(workspace.id);
  expect(signal.aborted).toBe(true);
  prepared.resolve({ launch, release });
  expect(await opening).toMatchObject({ message: "native_workspace_closing" });
  await forgotten;
  expect(release).toHaveBeenCalledOnce();
  expect(spawn).not.toHaveBeenCalled();
  await owners.close();
});

it("keeps a forgotten worker quarantined until its exact exit is observed", async () => {
  const { launch, workspace, owners } = fixture();
  const running = child(1);
  const replacement = child(1, { closeOnEof: true });
  spawn
    .mockReturnValueOnce(running.handle)
    .mockReturnValueOnce(replacement.handle);
  try {
    await owners.open(workspace);
    const forgotten = owners
      .closeWorkspace(workspace.id)
      .catch((error: unknown) => error);
    await running.eof;
    await vi.advanceTimersByTimeAsync(14_000);
    expect(await forgotten).toMatchObject({
      message: "native_workspace_shutdown_unverified",
    });
    expect(owners.current(workspace.id)).toBeNull();
    await expect(owners.open(workspace)).rejects.toThrow(
      "native_workspace_closing"
    );
    await expect(
      owners.open(workspace, {
        id: "another-profile",
        prepare: async () => ({ launch }),
      })
    ).rejects.toThrow("native_workspace_closing");
    expect(spawn).toHaveBeenCalledTimes(1);
    running.close("SIGKILL");
    await vi.waitFor(
      async () =>
        await expect(
          owners.closeWorkspace(workspace.id)
        ).resolves.toBeUndefined()
    );
    await owners.open(workspace);
    expect(spawn).toHaveBeenCalledTimes(2);
  } finally {
    running.close();
    await owners.close();
  }
});

it("quarantines a failed launch until its exact child and pipes close", async () => {
  const { workspace, owners, release } = fixture();
  const stale = child(2);
  const replacement = child(1, { closeOnEof: true });
  spawn
    .mockReturnValueOnce(stale.handle)
    .mockReturnValueOnce(replacement.handle);
  const opening = owners.open(workspace).catch((error: unknown) => error);
  await stale.eof;
  stale.events.emit("exit", 2, null);
  await vi.advanceTimersByTimeAsync(14_000);
  const pending = await opening;
  expect(pending).toBeInstanceOf(NativeAgentTerminationPending);
  expect(stale.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  expect(release).toHaveBeenCalledTimes(1);
  expect(owners.current(workspace.id)).toBeNull();
  child(1).close();
  await expect(owners.open(workspace)).rejects.toBe(pending);
  expect(spawn).toHaveBeenCalledTimes(1);

  stale.close("SIGKILL");
  await (pending as NativeAgentTerminationPending).terminated;
  const active = await owners.open(workspace);
  expect(owners.current(workspace.id)).toBe(active);
  expect(spawn).toHaveBeenCalledTimes(2);
  await owners.close();
  expect(release).toHaveBeenCalledTimes(2);
});

it("reports unverified drain while the quarantined child still owns its close", async () => {
  const { workspace, owners, release } = fixture();
  const stale = child(2);
  release.mockImplementationOnce(() => {
    throw new Error("fixture provider release failure");
  });
  stale.kill.mockImplementationOnce(() => {
    throw new Error("fixture signal failure");
  });
  spawn.mockReturnValue(stale.handle);
  const opening = owners.open(workspace).catch((error: unknown) => error);
  await stale.eof;
  const closing = owners.close();
  const result = closing.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(14_000);
  const pending = await opening;
  expect(pending).toBeInstanceOf(NativeAgentTerminationPending);
  expect(await result).toMatchObject({
    message: "native_workspace_shutdown_unverified",
  });
  await expect(owners.open(workspace)).rejects.toThrow(
    "native_workspace_closing"
  );
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  stale.close("SIGKILL");
  await (pending as NativeAgentTerminationPending).terminated;
});

it("reports the original startup failure if forced termination is observed", async () => {
  const { launch } = fixture();
  const incompatible = child(2, { closeOnKill: true });
  spawn.mockReturnValue(incompatible.handle);
  const opening = NativeAgentProcess.start(launch).catch(
    (error: unknown) => error
  );
  await incompatible.eof;
  await vi.advanceTimersByTimeAsync(12_000);
  expect(await opening).toMatchObject({
    message: "native_agent_protocol_incompatible",
  });
  expect(incompatible.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
});

it("releases exited workers' capacity and reports capacity while every worker is live", async () => {
  const { workspace, owners } = fixture();
  const workers = Array.from({ length: 10 }, () =>
    child(1, { closeOnEof: true })
  );
  for (const worker of workers) spawn.mockReturnValueOnce(worker.handle);
  const project = (index: number) => ({ ...workspace, id: `project-${index}` });
  try {
    for (let index = 0; index < 8; index++) await owners.open(project(index));
    await expect(owners.open(project(8))).rejects.toThrow(
      "native_workspace_capacity_reached"
    );
    expect(spawn).toHaveBeenCalledTimes(8);

    workers[0].close("SIGKILL");
    const opened = await owners.open(project(8));
    expect(owners.current(project(8).id)).toBe(opened);
    expect(owners.current(project(0).id)).toBeNull();
    for (let index = 1; index < 8; index++)
      expect(owners.current(project(index).id)).not.toBeNull();
    await expect(owners.open(project(9))).rejects.toThrow(
      "native_workspace_capacity_reached"
    );
  } finally {
    await owners.close();
  }
});
