// GRIDA-SEC-014 — explicit provider-root forwarding and host isolation.
// GRIDA-SEC-004 — sidecar supervision and launch-scoped command authority.
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
    get isPackaged() {
      return true;
    },
  },
}));
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://grida.co" }));
vi.mock("./sidecar-log", () => ({
  SidecarLogWriter: class {
    write() {}
  },
}));

import { ServicesSidecarSupervisor } from "./services-sidecar-supervisor";
import { app } from "electron";
import { ProviderNetworkHost } from "./provider-network-host";
import { ProviderNetworkPolicy } from "../provider-network-policy";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { DesktopMediaRoot } from "./media-root";
import { RetainedServiceSandbox } from "./retained-service-sandbox";

const supportsNativeChat =
  process.platform === "darwin" || process.platform === "linux";

describe("ServicesSidecarSupervisor recovery", () => {
  beforeEach(() => {
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/synthetic/compatibility-agent");
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

  it("starts the media sandbox without preparing scratch or command authority", async () => {
    const supervisor = new ServicesSidecarSupervisor();
    const state = supervisor as unknown as {
      initSandbox(): Promise<void>;
      scratchBase: string | null;
      commandHost: unknown;
    };
    vi.spyOn(app, "isPackaged", "get").mockReturnValue(false);
    vi.mocked(app.getPath).mockClear();

    await state.initSandbox();

    expect(state.scratchBase).toBeUndefined();
    expect(state.commandHost).toBeUndefined();
    expect(app.getPath).not.toHaveBeenCalledWith("temp");
    expect(
      (supervisor as unknown as { nativeSandbox: RetainedServiceSandbox })
        .nativeSandbox.configuration.filesystem.denyRead
    ).toContain(
      path.join(
        app.getPath("userData"),
        NativeDesktopProfile.chatStateDirectory
      )
    );
    expect(
      (supervisor as unknown as { nativeSandbox: RetainedServiceSandbox })
        .nativeSandbox.configuration
    ).toEqual(
      expect.objectContaining({
        network: expect.objectContaining({
          allowedDomains: [],
          allowLocalBinding: false,
        }),
      })
    );
    supervisor.stop();
  });

  it.runIf(supportsNativeChat)(
    "denies the chat store while serving ordinary native-chat services",
    async () => {
      const root = await fs.mkdtemp(
        path.join(await fs.realpath(os.tmpdir()), "grida-ordinary-services-")
      );
      const data = path.join(root, "agent");
      const browser = path.join(root, "browser");
      const media = path.join(browser, "Media");
      const temporary = path.join(root, "temp");
      try {
        await Promise.all(
          [data, media, temporary].map((directory) =>
            fs.mkdir(directory, { recursive: true })
          )
        );
        vi.stubEnv("GRIDA_AGENT_USER_DATA", data);
        vi.spyOn(app, "getPath").mockImplementation((name) =>
          name === "temp" ? temporary : name === "userData" ? browser : root
        );
        vi.spyOn(app, "isPackaged", "get").mockReturnValue(false);
        vi.spyOn(DesktopMediaRoot, "current").mockReturnValue(media);

        const supervisor = new ServicesSidecarSupervisor();
        const paths = supervisor.selectNativeChat(true);
        const state = supervisor as unknown as {
          initSandbox(): Promise<void>;
          scratchBase: string | null;
          commandHost: unknown;
        };
        await state.initSandbox();
        expect(state.scratchBase).toBeUndefined();
        expect(state.commandHost).toBeUndefined();
        expect(paths.desktopUserDataPath).toBe(browser);
        const protectedChat = [
          path.join(browser, NativeDesktopProfile.chatStateDirectory),
        ];
        expect(
          (supervisor as unknown as { nativeSandbox: RetainedServiceSandbox })
            .nativeSandbox.configuration
        ).toEqual(
          expect.objectContaining({
            filesystem: expect.objectContaining({
              denyRead: expect.arrayContaining(protectedChat),
              denyWrite: expect.arrayContaining(protectedChat),
              allowWrite: expect.arrayContaining([media]),
            }),
          })
        );
        const filesystem = (
          supervisor as unknown as { nativeSandbox: RetainedServiceSandbox }
        ).nativeSandbox.configuration.filesystem;
        expect(filesystem?.denyRead).not.toContain(browser);
        expect(filesystem?.denyWrite).not.toContain(browser);
        expect(await fs.readdir(temporary)).toEqual([]);
        expect(() => supervisor.selectNativeChat()).toThrow(
          "native_chat_selection_unavailable"
        );
        supervisor.stop();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  );

  it("forwards disabled agent startup without scratch or skill arguments", async () => {
    const supervisor = new ServicesSidecarSupervisor();
    // Inspect the exact native argv, then stop before spawning a real child.
    const prepare = vi
      .spyOn(RetainedServiceSandbox.prototype, "prepare")
      .mockImplementationOnce(() => {
        throw new Error("stop before spawn");
      });

    await expect(supervisor.start()).rejects.toThrow("stop before spawn");

    const command = prepare.mock.calls.at(-1)?.[1].join(" ");
    expect(command).toContain("--agent=disabled");
    expect(command).toContain("--media-root=");
    expect(command).toContain("--provider-home=");
    expect(command).not.toContain("--scratch-base=");
    expect(command).not.toContain("--skills-root=");
    supervisor.stop();
  });

  it("binds native subscription settings only to the selected native chat paths", async () => {
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/synthetic/subscription-source");
    const supervisor = new ServicesSidecarSupervisor();
    const network = { prepare: () => null };
    const egress = vi
      .spyOn(ProviderNetworkHost, "nativeProviderNetwork")
      .mockResolvedValue(network);
    await expect(supervisor.nativeSubscriptionSettings()).rejects.toThrow(
      "native_chatgpt_source_unavailable"
    );
    expect(egress).not.toHaveBeenCalled();
    supervisor.selectNativeChat();
    await expect(supervisor.nativeSubscriptionSettings()).resolves.toEqual({
      userDataPath: "/synthetic/subscription-source",
      network,
    });
    expect(egress).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      ProviderNetworkPolicy.CHATGPT_SUBSCRIPTION_GRANT_ID
    );
  });

  it("fixes native chat paths only for the primary app before starting chat services", async () => {
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/synthetic/native-agent");
    const supervisor = new ServicesSidecarSupervisor();
    vi.mocked(app.hasSingleInstanceLock).mockReturnValueOnce(false);
    expect(() => supervisor.selectNativeChat()).toThrow(
      "native_chat_selection_unavailable"
    );
    const paths = supervisor.selectNativeChat();
    expect(paths).toEqual(
      expect.objectContaining({
        userDataPath: "/synthetic/native-agent",
        desktopUserDataPath: app.getPath("userData"),
      })
    );
    expect(supervisor.selectNativeChat()).toBe(paths);
    const prepare = vi
      .spyOn(RetainedServiceSandbox.prototype, "prepare")
      .mockImplementationOnce(() => {
        throw new Error("stop before spawn");
      });
    await expect(supervisor.start()).rejects.toThrow("stop before spawn");
    const argv = prepare.mock.calls.at(-1)?.[1].join(" ");
    expect(argv).toContain("--agent=native-chat");
    expect(argv).not.toContain("--scratch-base=");
    expect(argv).not.toContain("--skills-root=");
  });

  it("cannot select native chat after services were started", async () => {
    const supervisor = new ServicesSidecarSupervisor();
    vi.spyOn(
      supervisor as unknown as { initSandbox(): Promise<void> },
      "initSandbox"
    ).mockRejectedValueOnce(new Error("services startup attempted"));
    await expect(supervisor.start()).rejects.toThrow(
      "services startup attempted"
    );
    supervisor.stop();
    expect(() => supervisor.selectNativeChat()).toThrow(
      "native_chat_selection_unavailable"
    );
  });

  it("shares the canonical Grida home and isolates an explicit agent data override", async () => {
    vi.stubEnv("GRIDA_HOME", "/synthetic/grida-home");
    vi.stubEnv("GRIDA_AGENT_USER_DATA", undefined);
    const shared = new ServicesSidecarSupervisor() as unknown as {
      user_data_path: string;
      provider_home: string;
      stop(): void;
    };
    expect(shared.user_data_path).toBe("/synthetic/grida-home/agent");
    expect(shared.provider_home).toBe("/synthetic/grida-home");
    shared.stop();
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/synthetic/isolated-agent");
    const isolated = new ServicesSidecarSupervisor() as unknown as {
      user_data_path: string;
      provider_home: string;
      stop(): void;
    };
    expect(isolated.user_data_path).toBe("/synthetic/isolated-agent");
    expect(isolated.provider_home).toBe("/synthetic/isolated-agent");
    isolated.stop();
  });

  it("retires and restarts when a grant snapshot is not acknowledged", async () => {
    const supervisor = new ServicesSidecarSupervisor();
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
    const supervisor = new ServicesSidecarSupervisor();
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
    const supervisor = new ServicesSidecarSupervisor();
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
    const supervisor = new ServicesSidecarSupervisor();
    const operation = vi.fn<() => Promise<string>>(async () => "never");

    await expect(
      supervisor.withTemporaryProviderEndpoint("not a URL", operation)
    ).rejects.toThrow(/valid URL/);

    expect(operation).not.toHaveBeenCalled();
    supervisor.stop();
  });

  it("rolls back a temporary grant when initial publication fails", async () => {
    const supervisor = new ServicesSidecarSupervisor();
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
    const supervisor = new ServicesSidecarSupervisor();
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
    const supervisor = new ServicesSidecarSupervisor();
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
  supervisor: ServicesSidecarSupervisor,
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

function customGrants(supervisor: ServicesSidecarSupervisor): unknown[] {
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
