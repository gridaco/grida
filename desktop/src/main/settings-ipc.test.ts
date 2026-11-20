// GRIDA-SEC-004 / GRIDA-SEC-005 — fixed Settings action admission.
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron";
import { EventEmitter } from "node:events";
import type { DesktopComposerPredictions } from "./desktop-composer-predictions";
import type { NativeAgentHooks } from "./native-agent-hooks";
import { beforeEach, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../bridge/contract";
import type { DesktopIpcRole } from "./ipc-admission";

const fixture = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  >(),
  window: {},
  windows: [] as unknown[],
  confirm:
    vi.fn<
      (window: unknown, options: unknown) => Promise<{ response: number }>
    >(),
  openPath: vi.fn<(file: string) => Promise<string>>(),
  endpoints: {
    set: vi.fn<(input: unknown, check: () => void) => Promise<void>>(),
    remove: vi.fn<(id: string, check: () => void) => Promise<void>>(),
    probe: vi.fn<(url: string, check: () => void) => Promise<unknown>>(),
    authorization: vi.fn<(id: string, url: string) => Promise<boolean>>(),
    updateModels: vi.fn<(input: unknown, check: () => void) => Promise<void>>(),
  },
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: () => fixture.window,
    getAllWindows: () => fixture.windows,
  },
  dialog: { showMessageBox: fixture.confirm },
  shell: { openPath: fixture.openPath },
  ipcMain: {
    on: vi.fn<() => void>(),
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    ) => fixture.handlers.set(channel, handler),
  },
}));
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://fixture.invalid" }));
vi.mock("../window", () => ({ isSafeExternalUrl: vi.fn<() => boolean>() }));
vi.mock("./services-sidecar-client", () => ({ servicesSidecarClient: {} }));
vi.mock("./services-sidecar-supervisor", () => ({
  agentProviderEndpointSettings: () => fixture.endpoints,
}));
vi.mock("./agent-provider-endpoint-mutation", () => ({
  AgentProviderEndpointMutation: { Coordinator: class {} },
}));
vi.mock("./host-apps", () => ({}));
vi.mock("./terminal-host", () => ({}));
vi.mock("./workspace-watcher-host", () => ({}));
vi.mock("./workspace-files", () => ({}));
vi.mock("./chatgpt-oauth", () => ({ unavailableChatGptOAuth: {} }));
vi.mock("./media-host", () => ({ DesktopMediaHost: class {} }));
vi.mock("./media-root", () => ({
  DesktopMediaRoot: { current: () => "/fixture/media" },
}));
vi.mock("./native-chat-ipc", () => ({ NativeChatIpc: class {} }));
vi.mock("./native-external-run-ipc", () => ({
  NativeExternalRunIpc: class {},
}));
vi.mock("./agent-notifications", () => ({}));

import { attachNavigationEvents, registerIpcHandlers } from "./ipc-handlers";

beforeEach(() => {
  fixture.handlers.clear();
  fixture.confirm.mockReset().mockResolvedValue({ response: 0 });
  fixture.openPath.mockReset().mockResolvedValue("");
  fixture.endpoints.set.mockReset().mockResolvedValue();
  fixture.endpoints.remove.mockReset().mockResolvedValue();
  fixture.endpoints.probe
    .mockReset()
    .mockResolvedValue({ source: "ollama", models: [] });
  fixture.endpoints.authorization.mockReset().mockResolvedValue(true);
  fixture.endpoints.updateModels.mockReset().mockResolvedValue();
});

function endpointsFixture() {
  const f = setup();
  f.mainFrame.url = "https://fixture.invalid/desktop/settings";
  const navigation = new EventEmitter();
  Object.assign(f.event.sender, {
    on: navigation.on.bind(navigation),
    once: navigation.once.bind(navigation),
    off: navigation.off.bind(navigation),
  });
  return { ...f, navigation };
}

it("routes explicit endpoint Save and non-minting discovery operations through Main without a native dialog", async () => {
  const f = endpointsFixture();
  const config = {
    id: "ollama",
    base_url: "http://localhost:11434/v1",
    models: [],
  };
  await f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_SET, config);
  expect(fixture.endpoints.set).toHaveBeenCalledExactlyOnceWith(
    config,
    expect.any(Function)
  );
  expect(
    await f.hook(
      IPC_CHANNELS.PROVIDER_ENDPOINT_AUTHORIZATION,
      config.id,
      config.base_url
    )
  ).toBe(true);
  await f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_PROBE, config.base_url);
  await f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_UPDATE_MODELS, config);
  await f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_DELETE, config.id);
  expect(fixture.endpoints.authorization).toHaveBeenCalledExactlyOnceWith(
    config.id,
    config.base_url
  );
  expect(fixture.endpoints.probe).toHaveBeenCalledExactlyOnceWith(
    config.base_url,
    expect.any(Function)
  );
  expect(fixture.endpoints.updateModels).toHaveBeenCalledExactlyOnceWith(
    config,
    expect.any(Function)
  );
  expect(fixture.endpoints.remove).toHaveBeenCalledExactlyOnceWith(
    config.id,
    expect.any(Function)
  );
  expect(fixture.confirm).not.toHaveBeenCalled();
});

it("denies endpoint authority outside the exact Settings main frame", async () => {
  const f = endpointsFixture();
  const config = {
    id: "ollama",
    base_url: "http://localhost:11434/v1",
    models: [],
  };
  f.mainFrame.url = "https://fixture.invalid/desktop/workspace?id=work";
  expect(() => f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_SET, config)).toThrow(
    "denied"
  );
  f.mainFrame.url = "https://fixture.invalid/desktop/settings";
  f.event.senderFrame = { url: f.mainFrame.url };
  expect(() => f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_SET, config)).toThrow(
    "denied"
  );
  f.event.senderFrame = f.mainFrame;
  f.role(null);
  expect(() => f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_SET, config)).toThrow(
    "denied"
  );
  expect(fixture.endpoints.set).not.toHaveBeenCalled();
});

it("revokes an endpoint Save request after navigation or role loss during native work", async () => {
  for (const navigate of [true, false]) {
    const f = endpointsFixture();
    fixture.endpoints.set.mockImplementationOnce(async (_input, check) => {
      if (navigate)
        f.navigation.emit("did-start-navigation", { isMainFrame: true });
      else f.role(null);
      check();
    });
    await expect(
      f.hook(IPC_CHANNELS.PROVIDER_ENDPOINT_SET, {
        id: "ollama",
        base_url: "http://localhost:11434/v1",
        models: [],
      })
    ).rejects.toThrow("denied");
  }
  expect(fixture.confirm).not.toHaveBeenCalled();
});

function setup(
  hooks?: NativeAgentHooks,
  preferences?: DesktopComposerPredictions
) {
  let role: DesktopIpcRole | null = "main";
  const open = vi.fn<() => void>();
  registerIpcHandlers({
    resolve_ipc_role: () => role,
    open_settings: open,
    global_hooks: hooks,
    composer_predictions: preferences,
  });
  const mainFrame = {
    url: "https://fixture.invalid/desktop/workspace?id=project",
  };
  const event = {
    sender: { mainFrame, isDestroyed: () => false },
    senderFrame: mainFrame as typeof mainFrame | null,
  };
  Object.assign(fixture.window, { webContents: event.sender });
  const invoke = (...args: unknown[]) =>
    fixture.handlers.get(IPC_CHANNELS.WINDOW_OPEN_SETTINGS)!(
      event as unknown as IpcMainInvokeEvent,
      ...args
    );
  return {
    event,
    mainFrame,
    hook: (channel: string, ...args: unknown[]) =>
      fixture.handlers.get(channel)!(
        event as unknown as IpcMainInvokeEvent,
        ...args
      ),
    open,
    invoke,
    role: (value: DesktopIpcRole | null) => {
      role = value;
    },
  };
}

it("restricts prediction writes to the live Settings frame and broadcasts only to admitted chat surfaces", async () => {
  const state = { enabled: false, revision: 0 };
  let broadcast!: (next: typeof state) => void;
  const owner = {
    get: vi.fn<DesktopComposerPredictions["get"]>(async () => state),
    set: vi.fn<(enabled: boolean, check: () => void) => Promise<typeof state>>(
      async (_enabled, check) => {
        check();
        return state;
      }
    ),
    onChange: vi.fn<DesktopComposerPredictions["onChange"]>((listener) => {
      broadcast = listener;
      return () => {};
    }),
  };
  const f = setup(undefined, owner as unknown as DesktopComposerPredictions);
  const navigation = new EventEmitter();
  Object.assign(f.event.sender, {
    on: navigation.on.bind(navigation),
    once: navigation.once.bind(navigation),
    off: navigation.off.bind(navigation),
  });
  for (const page of ["workspace", "file"]) {
    f.mainFrame.url = "https://fixture.invalid/desktop/" + page;
    expect(await f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_GET)).toEqual(state);
    expect(() => f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_SET, true)).toThrow(
      "denied"
    );
  }
  f.mainFrame.url = "https://fixture.invalid/desktop/settings";
  expect(await f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_GET)).toEqual(state);
  expect(await f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_SET, true)).toEqual(
    state
  );
  expect(() => f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_SET, "true")).toThrow(
    "composer_predictions_preference_invalid"
  );
  owner.set.mockImplementationOnce(async (_enabled, check) => {
    navigation.emit("did-start-navigation", { isMainFrame: true });
    check();
    return state;
  });
  await expect(
    f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_SET, true)
  ).rejects.toThrow("denied");
  f.event.senderFrame = null;
  expect(() => f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_SET, true)).toThrow(
    "denied"
  );

  const windows = [
    "https://fixture.invalid/desktop/workspace",
    "https://fixture.invalid/desktop/file",
    "https://fixture.invalid/desktop/settings",
    "https://fixture.invalid/desktop/tools",
    "https://other.invalid/desktop/settings",
  ].map((url) => ({
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      mainFrame: { url },
      send: vi.fn<() => void>(),
    },
  }));
  fixture.windows = windows;
  windows[0].webContents.send.mockImplementationOnce(() => {
    throw new Error("Object has been destroyed");
  });
  broadcast(state);
  expect(windows.map((w) => w.webContents.send.mock.calls.length)).toEqual([
    1, 1, 1, 0, 0,
  ]);
  f.role(null);
  broadcast(state);
  expect(windows.map((w) => w.webContents.send.mock.calls.length)).toEqual([
    1, 1, 1, 0, 0,
  ]);
});

it("reports that the preference is unavailable when Main has no native chat owner", () => {
  const f = setup();
  f.mainFrame.url = "https://fixture.invalid/desktop/settings";
  expect(() => f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_GET)).toThrow(
    "composer_predictions_unavailable"
  );
  expect(() => f.hook(IPC_CHANNELS.COMPOSER_PREDICTIONS_SET, false)).toThrow(
    "composer_predictions_unavailable"
  );
});

it("opens native Settings from an admitted main frame without navigating its caller", () => {
  const { invoke, mainFrame, open } = setup();
  const url = mainFrame.url;
  expect(invoke()).toBeUndefined();
  expect(open).toHaveBeenCalledExactlyOnceWith();
  expect(mainFrame.url).toBe(url);
});

it("rejects same-origin subframes, missing frames, destroyed senders, and arguments", () => {
  const { event, mainFrame, invoke, open } = setup();
  event.senderFrame = { url: mainFrame.url };
  expect(invoke).toThrow("denied");
  event.senderFrame = null;
  expect(invoke).toThrow("denied");
  event.senderFrame = mainFrame;
  expect(() => invoke("/desktop/settings")).toThrow(
    "settings window request denied"
  );
  vi.spyOn(event.sender, "isDestroyed").mockReturnValue(true);
  expect(invoke).toThrow("settings window request denied");
  expect(open).not.toHaveBeenCalled();
});

it("rejects foreign origins, non-Desktop paths, and unadmitted window roles", () => {
  const { mainFrame, invoke, open, role } = setup();
  for (const url of [
    "https://other.invalid/desktop/workspace",
    "https://fixture.invalid/blog",
    "https://fixture.invalid/desktop/auth/sign-in",
    "https://fixture.invalid/desktop/onboarding",
  ]) {
    mainFrame.url = url;
    expect(invoke).toThrow("denied");
  }
  for (const [value, pathname] of [
    ["sign-in", "/desktop/auth/sign-in"],
    ["onboarding", "/desktop/onboarding"],
    [null, "/desktop/workspace"],
  ] as const) {
    role(value);
    mainFrame.url = `https://fixture.invalid${pathname}`;
    expect(invoke).toThrow("denied");
  }
  expect(open).not.toHaveBeenCalled();
});

function hooksFixture() {
  const inspection = {
    configPath: "/fixture/config.toml",
    exists: true,
    hooks: [],
    diagnostics: [],
    activation: "new_connections" as const,
  };
  const definition = {
    id: "check",
    revision: "a".repeat(64),
    event: "before_completion" as const,
    executable: "/usr/bin/printf",
    arguments: [],
    source: "/fixture/config.toml",
    mode: "required" as const,
    enabled: true,
    timeoutMs: 2000,
  };
  const owner = {
    configuration: vi
      .fn<() => Promise<typeof inspection>>()
      .mockResolvedValue(inspection),
    ensureConfig: vi
      .fn<() => Promise<string>>()
      .mockResolvedValue(inspection.configPath),
    reviewConfigured: vi
      .fn<
        (
          id: string,
          revision: string
        ) => Promise<{ definition: typeof definition; workspace: string }>
      >()
      .mockResolvedValue({ definition, workspace: "All workspaces" }),
    trust: vi.fn<(review: unknown) => Promise<void>>().mockResolvedValue(),
  };
  const state = setup(owner as unknown as NativeAgentHooks);
  state.mainFrame.url = "https://fixture.invalid/desktop/settings";
  return { ...state, owner, inspection, definition };
}

it("inspects/reloads global hooks and opens only the canonical config from Settings", async () => {
  const f = hooksFixture();
  expect(await f.hook(IPC_CHANNELS.GLOBAL_HOOKS_INSPECT)).toEqual(f.inspection);
  expect(await f.hook(IPC_CHANNELS.GLOBAL_HOOKS_RELOAD)).toEqual(f.inspection);
  await f.hook(IPC_CHANNELS.GLOBAL_HOOKS_OPEN_CONFIG);
  expect(fixture.openPath).toHaveBeenCalledExactlyOnceWith(
    f.inspection.configPath
  );
  expect(f.owner.trust).not.toHaveBeenCalled();
});

it("requires native explicit review of the exact global hook revision", async () => {
  const f = hooksFixture();
  expect(
    await f.hook(
      IPC_CHANNELS.GLOBAL_HOOKS_REVIEW,
      "check",
      f.definition.revision
    )
  ).toBeNull();
  expect(f.owner.trust).not.toHaveBeenCalled();
  fixture.confirm.mockResolvedValueOnce({ response: 1 });
  expect(
    await f.hook(
      IPC_CHANNELS.GLOBAL_HOOKS_REVIEW,
      "check",
      f.definition.revision
    )
  ).toEqual(f.inspection);
  expect(f.owner.reviewConfigured).toHaveBeenLastCalledWith(
    "check",
    f.definition.revision
  );
  expect(f.owner.trust).toHaveBeenCalledOnce();
});

it("denies global hook operations from chat routes, subframes and injected arguments", async () => {
  const f = hooksFixture();
  f.mainFrame.url = "https://fixture.invalid/desktop/workspace?id=work";
  expect(() => f.hook(IPC_CHANNELS.GLOBAL_HOOKS_INSPECT)).toThrow("denied");
  f.mainFrame.url = "https://fixture.invalid/desktop/settings";
  f.event.senderFrame = { url: f.mainFrame.url };
  expect(() => f.hook(IPC_CHANNELS.GLOBAL_HOOKS_INSPECT)).toThrow("denied");
  f.event.senderFrame = f.mainFrame;
  expect(() =>
    f.hook(IPC_CHANNELS.GLOBAL_HOOKS_INSPECT, "/arbitrary/path")
  ).toThrow("denied");
  await expect(
    f.hook(IPC_CHANNELS.GLOBAL_HOOKS_OPEN_CONFIG, "/arbitrary/path")
  ).rejects.toThrow("denied");
  await expect(
    f.hook(IPC_CHANNELS.GLOBAL_HOOKS_REVIEW, "check", "invalid")
  ).rejects.toThrow("invalid");
  expect(f.owner.configuration).not.toHaveBeenCalled();
  expect(fixture.openPath).not.toHaveBeenCalled();
});

it("revalidates Settings admission after the native trust dialog", async () => {
  const f = hooksFixture();
  fixture.confirm.mockImplementationOnce(async () => {
    f.role(null);
    return { response: 1 };
  });
  await expect(
    f.hook(IPC_CHANNELS.GLOBAL_HOOKS_REVIEW, "check", f.definition.revision)
  ).rejects.toThrow("denied");
  expect(f.owner.trust).not.toHaveBeenCalled();
});

it("publishes completed route changes even when navigation-history flags remain identical", () => {
  let url = "https://fixture.invalid/desktop/workspace?id=eac20941e6a410aa";
  let previousUrl = "https://fixture.invalid/desktop/workspace?id=previous";
  const contents = Object.assign(new EventEmitter(), {
    getURL: () => url,
    isDestroyed: () => false,
    navigationHistory: {
      canGoToOffset: (offset: number) => offset === -1,
      getActiveIndex: () => 1,
      getEntryAtIndex: () => ({ url: previousUrl }),
    },
    send: vi.fn<(channel: string, state: unknown) => void>(),
  });
  attachNavigationEvents({
    webContents: contents as unknown as WebContents,
  } as BrowserWindow);
  contents.emit("did-navigate", {}, url);
  url = "https://fixture.invalid/desktop/settings";
  contents.emit("did-navigate-in-page", {}, url, true);
  contents.emit("did-navigate-in-page", {}, url, true);
  url = "https://fixture.invalid/desktop/workspace?id=eac20941e6a410aa";
  contents.emit("did-navigate-in-page", {}, url, true);
  previousUrl = "https://fixture.invalid/desktop/welcome";
  contents.emit("did-navigate-in-page", {}, url, true);
  contents.emit("did-navigate-in-page", {}, url, true);
  expect(contents.send.mock.calls).toEqual([
    [
      IPC_CHANNELS.WINDOW_NAVIGATION_CHANGED,
      { can_go_back: true, can_go_forward: false },
    ],
    [
      IPC_CHANNELS.WINDOW_NAVIGATION_CHANGED,
      { can_go_back: true, can_go_forward: false },
    ],
    [
      IPC_CHANNELS.WINDOW_NAVIGATION_CHANGED,
      { can_go_back: true, can_go_forward: false },
    ],
    [
      IPC_CHANNELS.WINDOW_NAVIGATION_CHANGED,
      { can_go_back: true, can_go_forward: false, back_destination: "home" },
    ],
  ]);
});

it("describes and traverses the same adjacent Desktop history entries", () => {
  const f = setup();
  const home = "https://fixture.invalid/desktop/welcome";
  const entries = [
    "https://fixture.invalid/desktop/settings",
    home,
    f.mainFrame.url,
    home,
    "https://fixture.invalid/desktop/tools",
  ];
  let active = 2;
  const goToOffset = vi.fn<(offset: number) => void>((offset) => {
    active += offset;
  });
  Object.assign(f.event.sender, {
    navigationHistory: {
      canGoToOffset: (offset: number) => entries[active + offset] !== undefined,
      getActiveIndex: () => active,
      getEntryAtIndex: (index: number) => ({ url: entries[index] }),
      goToOffset,
    },
  });

  expect(f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_STATE)).toEqual({
    can_go_back: true,
    can_go_forward: true,
    back_destination: "home",
    forward_destination: "home",
  });
  f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_BACK);
  expect(entries[active]).toBe(home);
  f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_FORWARD);
  f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_FORWARD);
  expect(entries[active]).toBe(home);
  expect(goToOffset.mock.calls).toEqual([[-1], [1], [1]]);

  active = 2;
  entries[1] = `${home}?startup=restore-last-workspace`;
  entries[3] = `${home}#section`;
  expect(f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_STATE)).toEqual({
    can_go_back: true,
    can_go_forward: true,
  });

  entries[1] = "https://different.invalid/desktop/welcome";
  entries[3] = "https://fixture.invalid/account";
  expect(f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_STATE)).toEqual({
    can_go_back: false,
    can_go_forward: false,
  });
  f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_BACK);
  f.hook(IPC_CHANNELS.WINDOW_NAVIGATION_FORWARD);
  expect(goToOffset).toHaveBeenCalledTimes(3);
});
