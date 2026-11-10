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
