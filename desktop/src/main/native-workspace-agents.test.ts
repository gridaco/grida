// GRIDA-SEC-004 — workspace startup quarantine and exact child exit evidence.
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import type { NativeAgentCutover } from "./native-agent-cutover";
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
  const cutover = {
    startWorkspace: async (_id, options) => ({
      chat: await NativeAgentChat.start({ ...options, stateDirectory }),
      stateDirectory,
      archive: null,
    }),
  } satisfies Pick<NativeAgentCutover, "startWorkspace">;
  const release = vi.fn<() => void>();
  const owners = new NativeWorkspaceAgents(cutover, async () => ({
    launch,
    release,
  }));
  return { launch: { ...launch, stateDirectory }, workspace, owners, release };
}

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

it("drains a forgotten workspace's default and saved workers without touching other workspaces", async () => {
  const { launch, workspace, owners } = fixture();
  const ordinary = child(1);
  const saved = child(1, { closeOnEof: true });
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
    await owners.open(workspace, profile);
    const retained = await owners.open(other);
    const forgotten = owners.closeWorkspace(workspace.id);
    expect(owners.current(workspace.id)).toBeNull();
    expect(owners.current(workspace.id, profile.id)).toBeNull();
    expect(owners.current(other.id)).toBe(retained);
    await ordinary.eof;
    await saved.eof;
    await expect(owners.open(workspace)).rejects.toThrow(
      "native_workspace_closing"
    );
    expect(spawn).toHaveBeenCalledTimes(3);
    ordinary.close();
    await forgotten;
    const reopened = await owners.open(workspace);
    expect(reopened).not.toBe(original);
    expect(owners.current(workspace.id)).toBe(reopened);
    expect(owners.current(other.id)).toBe(retained);
  } finally {
    ordinary.close();
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
