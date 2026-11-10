// GRIDA-SEC-014 — explicit provider-root forwarding and host isolation.
// GRIDA-SEC-004 — sidecar supervision and launch-scoped command authority.
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    once: vi.fn<
      (event: string, listener: (...args: unknown[]) => void) => void
    >(),
    getPath: vi.fn<(name: string) => string>((name) =>
      name === "documents" ? "/Users/test/Documents" : "/Users/test"
    ),
    getAppPath: vi.fn<() => string>(() => "/app/desktop"),
    hasSingleInstanceLock: vi.fn<() => boolean>(() => true),
  },
}));
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://grida.co" }));
vi.mock("./sidecar-log", () => ({
  SidecarLogWriter: class {
    write() {}
  },
}));
vi.mock("./sandbox/manager", () => ({
  ensureInitialized: vi.fn<() => Promise<void>>(async () => undefined),
  wrap: vi.fn<(command: string) => Promise<string>>(async (command) => command),
  dispose: vi.fn<() => Promise<void>>(async () => undefined),
  isSupportedPlatform: vi.fn<() => boolean>(() => true),
  checkDependencies: vi.fn<() => null>(() => null),
}));

import { AgentSidecarSupervisor } from "./agent-sidecar-supervisor";
import { app } from "electron";
import { AgentNetworkHost } from "./agent-network-host";
import { AgentNetworkPolicy } from "../agent-network-policy";
import { ensureInitialized, wrap } from "./sandbox/manager";

describe("AgentSidecarSupervisor recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("withdraws admission and joins both the cleanup receipt and exact child close", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const child = fakeChild();
    const ack = Promise.withResolvers<void>();
    const requestDrain = vi.fn<() => Promise<void>>(() => ack.promise);
    const close = vi.fn<() => void>();
    Object.assign(supervisor, {
      child: child.value,
      activeGeneration: 3,
      info: { port: 43123, password: "fixture" },
      networkHost: { requestDrain, close: vi.fn<() => void>() },
      daemonSocketHost: { close },
    });
    const shutdown = supervisor.drain();
    expect(supervisor.drain()).toBe(shutdown);
    expect(supervisor.getInfo()).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
    expect(requestDrain).toHaveBeenCalledTimes(1);
    let settled = false;
    const observed = shutdown.then(() => {
      settled = true;
    });
    ack.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    child.value.emit("close", 0, null);
    await observed;
    expect(child.kill).not.toHaveBeenCalled();
    await expect(supervisor.start()).rejects.toThrow(
      "agent_sidecar_shutting_down"
    );
  });

  it("refuses a cleanup receipt without a clean child exit", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const child = fakeChild();
    Object.assign(supervisor, {
      child: child.value,
      activeGeneration: 3,
      info: { port: 43123, password: "fixture" },
      networkHost: { requestDrain: async () => {}, close: vi.fn<() => void>() },
      daemonSocketHost: { close: vi.fn<() => void>() },
    });
    const shutdown = supervisor.drain();
    child.value.emit("close", 1, null);
    await expect(shutdown).rejects.toThrow("agent_sidecar_drain_unverified");
    expect(supervisor.getInfo()).toBeNull();
  });

  it("starts the media sandbox without preparing scratch or command authority", async () => {
    const supervisor = new AgentSidecarSupervisor({ agent: false });
    const state = supervisor as unknown as {
      initSandbox(): Promise<void>;
      scratchBase: string | null;
      commandHost: unknown;
    };
    vi.mocked(app.getPath).mockClear();
    vi.mocked(ensureInitialized).mockClear();

    await state.initSandbox();

    expect(state.scratchBase).toBeNull();
    expect(state.commandHost).toBeNull();
    expect(app.getPath).not.toHaveBeenCalledWith("temp");
    expect(ensureInitialized).toHaveBeenCalledWith(
      expect.objectContaining({
        network: expect.objectContaining({
          allowedDomains: [],
          allowLocalBinding: false,
        }),
      })
    );
    supervisor.stop();
  });

  it("forwards disabled agent startup without scratch or skill arguments", async () => {
    const supervisor = new AgentSidecarSupervisor({ agent: false });
    const state = supervisor as unknown as { spawnOne(): Promise<unknown> };
    // Inspect the exact wrapped argv, then stop before spawning a real child.
    vi.mocked(wrap).mockRejectedValueOnce(new Error("stop before spawn"));

    await expect(state.spawnOne()).rejects.toThrow("stop before spawn");

    const command = vi.mocked(wrap).mock.calls.at(-1)?.[0];
    expect(command).toContain("--agent=disabled");
    expect(command).toContain("--media-root=");
    expect(command).toContain("--provider-home=");
    expect(command).not.toContain("--scratch-base=");
    expect(command).not.toContain("--skills-root=");
    supervisor.stop();
  });

  it("binds native subscription settings only to the sealed source", async () => {
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/synthetic/subscription-source");
    const supervisor = new AgentSidecarSupervisor();
    const network = { prepare: () => null };
    const egress = vi
      .spyOn(AgentNetworkHost, "nativeProviderNetwork")
      .mockResolvedValue(network);
    await expect(supervisor.nativeSubscriptionSettings()).rejects.toThrow(
      "native_chatgpt_source_unavailable"
    );
    expect(egress).not.toHaveBeenCalled();
    await supervisor.sealLegacyChatForColdStart();
    await expect(supervisor.nativeSubscriptionSettings()).resolves.toEqual({
      userDataPath: "/synthetic/subscription-source",
      network,
    });
    expect(egress).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID
    );
  });

  it("seals the exact legacy roots only for the primary app before selecting media-only startup", async () => {
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/synthetic/cold-legacy");
    const supervisor = new AgentSidecarSupervisor();
    vi.mocked(app.hasSingleInstanceLock).mockReturnValueOnce(false);
    await expect(supervisor.sealLegacyChatForColdStart()).rejects.toThrow(
      "legacy_chat_cold_start_required"
    );
    const source = await supervisor.sealLegacyChatForColdStart();
    const { defaultScratchBase } = await import("@grida/agent/sandbox");
    expect(source).toEqual(
      expect.objectContaining({
        userDataPath: "/synthetic/cold-legacy",
        scratchBase: defaultScratchBase(
          "/synthetic/cold-legacy",
          app.getPath("temp")
        ),
        desktopUserDataPath: app.getPath("userData"),
      })
    );
    expect(await supervisor.sealLegacyChatForColdStart()).toBe(source);
    vi.mocked(wrap).mockRejectedValueOnce(new Error("stop before spawn"));
    await expect(supervisor.start()).rejects.toThrow("stop before spawn");
    const argv = vi.mocked(wrap).mock.calls.at(-1)?.[0];
    expect(argv).toContain("--agent=native-chat");
    expect(argv).not.toContain("--scratch-base=");
    expect(argv).not.toContain("--skills-root=");
  });

  it("cannot use cold-start evidence after legacy startup was attempted", async () => {
    const supervisor = new AgentSidecarSupervisor();
    vi.spyOn(
      supervisor as unknown as { initSandbox(): Promise<void> },
      "initSandbox"
    ).mockRejectedValueOnce(new Error("legacy startup attempted"));
    await expect(supervisor.start()).rejects.toThrow(
      "legacy startup attempted"
    );
    supervisor.stop();
    await expect(supervisor.sealLegacyChatForColdStart()).rejects.toThrow(
      "legacy_chat_cold_start_required"
    );
  });

  it("shares the canonical Grida home and isolates an explicit agent data override", async () => {
    vi.stubEnv("GRIDA_HOME", "/synthetic/grida-home");
    vi.stubEnv("GRIDA_AGENT_USER_DATA", undefined);
    const shared = new AgentSidecarSupervisor({ agent: false }) as unknown as {
      user_data_path: string;
      provider_home: string;
      stop(): void;
    };
    expect(shared.user_data_path).toBe("/synthetic/grida-home/agent");
    expect(shared.provider_home).toBe("/synthetic/grida-home");
    shared.stop();
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/synthetic/isolated-agent");
    const isolated = new AgentSidecarSupervisor({
      agent: false,
    }) as unknown as {
      user_data_path: string;
      provider_home: string;
      stop(): void;
    };
    expect(isolated.user_data_path).toBe("/synthetic/isolated-agent");
    expect(isolated.provider_home).toBe("/synthetic/isolated-agent");
    isolated.stop();
  });

  it("retires and restarts when a grant snapshot is not acknowledged", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const child = fakeChild();
    const networkHost = {
      updateGrants: vi.fn<() => Promise<void>>(async () => {
        throw new Error("grant acknowledgement timed out");
      }),
      close: vi.fn<() => void>(),
    };
    const daemonSocketHost = { close: vi.fn<() => void>() };
    const spawn = vi.fn<() => Promise<{ port: number; password: string }>>(
      async () => ({ port: 43123, password: "replacement" })
    );
    const state = supervisor as unknown as {
      child: ChildProcess;
      activeGeneration: number;
      networkHost: typeof networkHost;
      daemonSocketHost: typeof daemonSocketHost;
      spawn: typeof spawn;
    };
    state.child = child.value;
    state.activeGeneration = 7;
    state.networkHost = networkHost;
    state.daemonSocketHost = daemonSocketHost;
    state.spawn = spawn;

    await expect(
      supervisor.approveProviderEndpoint("ollama", "http://localhost:11434/v1")
    ).rejects.toThrow(/acknowledgement timed out/);

    expect(networkHost.close).toHaveBeenCalledTimes(1);
    expect(daemonSocketHost.close).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(supervisor.getInfo()).toBeNull();
    await vi.advanceTimersByTimeAsync(250);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale generation retire or restart its replacement", () => {
    const supervisor = new AgentSidecarSupervisor();
    const stale = fakeChild();
    const current = fakeChild();
    const networkHost = { close: vi.fn<() => void>() };
    const daemonSocketHost = { close: vi.fn<() => void>() };
    const state = supervisor as unknown as {
      child: ChildProcess;
      activeGeneration: number;
      networkHost: typeof networkHost;
      daemonSocketHost: typeof daemonSocketHost;
      retireGeneration(
        child: ChildProcess,
        generation: number,
        restart: boolean
      ): void;
      restartTimer: NodeJS.Timeout | null;
    };
    state.child = current.value;
    state.activeGeneration = 9;
    state.networkHost = networkHost;
    state.daemonSocketHost = daemonSocketHost;

    state.retireGeneration(stale.value, 8, true);

    expect(stale.kill).not.toHaveBeenCalled();
    expect(current.kill).not.toHaveBeenCalled();
    expect(networkHost.close).not.toHaveBeenCalled();
    expect(daemonSocketHost.close).not.toHaveBeenCalled();
    expect(state.child).toBe(current.value);
    expect(state.restartTimer).toBeNull();
    supervisor.stop();
  });

  it("does not let a late grant failure retire its replacement host", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const stale = fakeChild();
    const current = fakeChild();
    let rejectPublication!: (error: Error) => void;
    const staleNetworkHost = {
      updateGrants: vi.fn<() => Promise<void>>(
        async () =>
          await new Promise<void>((_resolve, reject) => {
            rejectPublication = reject;
          })
      ),
      close: vi.fn<() => void>(),
    };
    const staleDaemonSocketHost = { close: vi.fn<() => void>() };
    const currentNetworkHost = {
      updateGrants: vi.fn<() => Promise<void>>(async () => undefined),
      close: vi.fn<() => void>(),
    };
    const currentDaemonSocketHost = { close: vi.fn<() => void>() };
    const state = supervisor as unknown as {
      child: ChildProcess;
      activeGeneration: number;
      networkHost: typeof staleNetworkHost | typeof currentNetworkHost;
      daemonSocketHost:
        | typeof staleDaemonSocketHost
        | typeof currentDaemonSocketHost;
      restartTimer: NodeJS.Timeout | null;
    };
    state.child = stale.value;
    state.activeGeneration = 4;
    state.networkHost = staleNetworkHost;
    state.daemonSocketHost = staleDaemonSocketHost;
    const publication = supervisor.approveProviderEndpoint(
      "ollama",
      "http://localhost:11434/v1"
    );
    const publicationError = publication.catch((error: unknown) => error);
    expect(staleNetworkHost.updateGrants).toHaveBeenCalledTimes(1);

    state.child = current.value;
    state.activeGeneration = 5;
    state.networkHost = currentNetworkHost;
    state.daemonSocketHost = currentDaemonSocketHost;
    rejectPublication(new Error("late grant failure"));

    expect(await publicationError).toEqual(
      expect.objectContaining({ message: "late grant failure" })
    );
    expect(stale.kill).not.toHaveBeenCalled();
    expect(current.kill).not.toHaveBeenCalled();
    expect(currentNetworkHost.close).not.toHaveBeenCalled();
    expect(currentDaemonSocketHost.close).not.toHaveBeenCalled();
    expect(state.child).toBe(current.value);
    expect(state.restartTimer).toBeNull();
    supervisor.stop();
  });

  it("propagates temporary-endpoint validation failures", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const operation = vi.fn<() => Promise<string>>(async () => "never");

    await expect(
      supervisor.withTemporaryProviderEndpoint("not a URL", operation)
    ).rejects.toThrow(/valid URL/);

    expect(operation).not.toHaveBeenCalled();
    supervisor.stop();
  });

  it("rolls back a temporary grant when initial publication fails", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const running = installRunningState(supervisor, [
      new Error("grant acknowledgement timed out"),
    ]);
    const operation = vi.fn<() => Promise<string>>(async () => "never");

    await expect(
      supervisor.withTemporaryProviderEndpoint(
        "http://localhost:11434/v1",
        operation
      )
    ).rejects.toThrow(/acknowledgement timed out/);

    expect(operation).not.toHaveBeenCalled();
    expect(customGrants(supervisor)).toHaveLength(0);
    expect(running.child.kill).toHaveBeenCalledWith("SIGTERM");
    supervisor.stop();
  });

  it("revokes a temporary grant when the operation fails", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const running = installRunningState(supervisor, [null, null]);

    await expect(
      supervisor.withTemporaryProviderEndpoint(
        "http://localhost:11434/v1",
        async () => {
          throw new Error("probe failed");
        }
      )
    ).rejects.toThrow("probe failed");

    expect(running.networkHost.updateGrants).toHaveBeenCalledTimes(2);
    expect(customGrants(supervisor)).toHaveLength(0);
    supervisor.stop();
  });

  it("keeps cleanup revocation committed when its ACK fails", async () => {
    const supervisor = new AgentSidecarSupervisor();
    const running = installRunningState(supervisor, [
      null,
      new Error("cleanup acknowledgement timed out"),
    ]);

    await expect(
      supervisor.withTemporaryProviderEndpoint(
        "http://localhost:11434/v1",
        async () => "probe result"
      )
    ).rejects.toThrow(/cleanup acknowledgement timed out/);

    expect(customGrants(supervisor)).toHaveLength(0);
    expect(running.child.kill).toHaveBeenCalledWith("SIGTERM");
    supervisor.stop();
  });
});

function installRunningState(
  supervisor: AgentSidecarSupervisor,
  updateResults: Array<Error | null>
) {
  const child = fakeChild();
  const networkHost = {
    updateGrants: vi.fn<() => Promise<void>>(async () => {
      const result = updateResults.shift();
      if (result) throw result;
    }),
    close: vi.fn<() => void>(),
  };
  const daemonSocketHost = { close: vi.fn<() => void>() };
  const state = supervisor as unknown as {
    child: ChildProcess;
    activeGeneration: number;
    networkHost: typeof networkHost;
    daemonSocketHost: typeof daemonSocketHost;
  };
  state.child = child.value;
  state.activeGeneration = 1;
  state.networkHost = networkHost;
  state.daemonSocketHost = daemonSocketHost;
  return { child, networkHost, daemonSocketHost };
}

function customGrants(supervisor: AgentSidecarSupervisor): unknown[] {
  const state = supervisor as unknown as {
    networkAuthority: { grants(): Array<{ id: string }> };
  };
  return state.networkAuthority
    .grants()
    .filter((grant) => grant.id.startsWith("provider:custom:"));
}

function fakeChild(): {
  value: ChildProcess;
  kill: ReturnType<typeof vi.fn>;
} {
  const events = new EventEmitter();
  const kill = vi.fn<(signal?: number | NodeJS.Signals) => boolean>(() => true);
  Object.assign(events, { kill });
  return { value: events as unknown as ChildProcess, kill };
}
