// GRIDA-SEC-004 / GRIDA-SEC-016 — exact renderer publication and tooling lease.
import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { DesktopBrowserTools } from "./desktop-browser-tools";
import type { DesktopBrowserHost } from "./browser-host";
import { NativeEditorSurfaceEndpoints } from "./native-editor-surfaces";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import type { ObservedWorkbenchDocument } from "./browser-automation";
import { FxViewer } from "./fx-viewer";

vi.mock("electron", () => ({ BrowserWindow: { fromWebContents: () => null } }));
const operations = vi.hoisted(() => ({
  invoke: vi.fn<DesktopBrowserToolLease["invoke"]>(),
  closeScope: vi.fn<(id: string) => void>(),
  registerOpen: vi.fn<() => { kind: "navigation"; navigationId: string }>(),
  observeWorkbenchDocument:
    vi.fn<() => Promise<ObservedWorkbenchDocument | null>>(),
}));
vi.mock("./browser-automation", () => ({
  BrowserAutomation: class {
    invoke = operations.invoke;
    closeScope = operations.closeScope;
    registerOpen = operations.registerOpen;
    observeWorkbenchDocument = operations.observeWorkbenchDocument;
  },
}));

const pageId = "d3c61462-e5eb-4c40-9509-b1ca37507c72";
const file = "/design.grida";
const snapshot = { active: null, open: [file], truncated: false };
const signal = new AbortController().signal;

function workbench() {
  const frame = {
    url: "https://grida.co/desktop/workspace?id=5bd8f11d11d7effe",
    send: vi.fn<(channel: string, payload: unknown) => void>(),
  };
  const sender = {
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
  };
  return {
    frame,
    sender,
    event: { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent,
  };
}

it("projects the current workbench and binds requests to their exact publication", async () => {
  const page = {
    snapshot: () => ({
      id: pageId,
      title: "App",
      url: "http://localhost:3000/",
      mounted: true,
      loading: false,
      failure: null,
    }),
  };
  const host = {
    automationWorkbenchPages: vi.fn<() => (typeof page)[]>(() => [page]),
    presentWorkbenchAutomationPage: vi.fn<
      DesktopBrowserHost["presentWorkbenchAutomationPage"]
    >(() => true),
  };
  const tools = new DesktopBrowserTools(host as unknown as DesktopBrowserHost);
  const first = workbench();
  const lease = tools.lease(
    first.event.sender,
    first.event.senderFrame!,
    () => {}
  );
  expect(lease.ready()).toBe(false);
  expect(tools.publish(first.event, snapshot, pageId)).toBe(true);
  const listed = await lease.invoke("surface_list_open", {}, signal);
  expect(listed).toMatchObject({
    data: {
      activeTabId: pageId,
      tabs: [
        { kind: "browser", tabId: pageId, state: "ready" },
        { kind: "file", path: file },
      ],
    },
  });
  const fileId = (listed.data!.tabs as { tabId: string }[])[1]!.tabId;
  await expect(
    lease.invoke(
      "surface_open",
      { target: { kind: "tab", tabId: pageId } },
      signal
    )
  ).resolves.toMatchObject({
    data: { tabId: pageId, presentation: "requested" },
  });
  expect(host.presentWorkbenchAutomationPage).toHaveBeenCalledWith(
    expect.objectContaining({ sender: first.sender, frame: first.frame }),
    pageId,
    false
  );
  await expect(
    lease.invoke(
      "surface_open",
      { target: { kind: "tab", tabId: fileId } },
      signal
    )
  ).resolves.toMatchObject({ data: { tabId: fileId } });
  expect(first.frame.send).toHaveBeenCalledWith(expect.any(String), {
    path: file,
    expiresAtMs: expect.any(Number),
  });
  tools.publish(
    first.event,
    { active: null, open: [], truncated: false },
    null
  );
  tools.publish(first.event, snapshot, pageId);
  const relisted = await lease.invoke("surface_list_open", {}, signal);
  expect((relisted.data!.tabs as { tabId: string }[])[1]!.tabId).not.toBe(
    fileId
  );
  first.sender.mainFrame = workbench().frame;
  await expect(
    lease.invoke("browser_open", { url: "https://example.test" }, signal)
  ).resolves.toEqual({ disposition: "not_dispatched", error: "owner_revoked" });
  expect(operations.invoke).not.toHaveBeenCalled();
  lease.close();
  expect(operations.closeScope).toHaveBeenCalledWith(expect.any(String));
});

it("discards the selected FX sample when selection leaves and returns to the same tab", async () => {
  const project = "a".repeat(64);
  const entry = "b".repeat(64);
  const base = "http://127.0.0.1:8787/";
  const url = `${base}p/${project}/runs/${entry}/`;
  const pending = Promise.withResolvers<ObservedWorkbenchDocument>();
  const observing = Promise.withResolvers<void>();
  operations.observeWorkbenchDocument.mockImplementationOnce(() => {
    observing.resolve();
    return pending.promise;
  });
  const host = {
    resolveAutomationPage: vi.fn<
      () => { snapshot: () => { url: string }; visible: () => boolean }
    >(() => ({
      snapshot: () => ({ url }),
      visible: () => true,
    })),
  };
  const viewer = new FxViewer(
    async () => ({ root: "/workspace", identity: "preserved" }),
    async () => ({
      kind: "fx-service-status-v1",
      protocol_version: 1,
      state: "running",
      project_id: project,
      instance_id: "c".repeat(64),
      url: base,
    })
  );
  const tools = new DesktopBrowserTools(
    host as unknown as DesktopBrowserHost,
    viewer
  );
  const { event } = workbench();
  tools.publish(event, snapshot, pageId);
  const sample = tools.captureEditorObservation(event.sender, signal);
  await observing.promise;
  tools.publish(event, snapshot, null);
  tools.publish(event, snapshot, pageId);
  pending.resolve({
    id: "fx-doc",
    current: () => true,
    value: {
      subject: {
        kind: "run",
        reference: {
          kind: "service_entry",
          project_id: project,
          entry_kind: "run",
          entry_id: entry,
        },
      },
      scope_id: null,
      selection: null,
      sampled_at: 12,
    },
  });
  await expect(sample).resolves.toBeNull();
  expect(host.resolveAutomationPage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ sender: event.sender, frame: event.senderFrame }),
    { kind: "workbench", tabId: pageId }
  );
});

it("reads FX preview readiness from the captured workspace lease and drops a reply after it retires", async () => {
  const project = "a".repeat(64);
  const entry = {
    kind: "service_entry",
    project_id: project,
    entry_kind: "plan",
    entry_id: "b".repeat(64),
  };
  const workspaceId = "5bd8f11d11d7effe";
  const pending = Promise.withResolvers<unknown>();
  const status = Promise.withResolvers<void>();
  let live = true;
  const root = vi.fn<ConstructorParameters<typeof FxViewer>[0]>(async () => ({
    root: "/workspace",
    identity: "selected",
  }));
  const viewer = new FxViewer(root, async () => {
    status.resolve();
    return pending.promise;
  });
  const browser = {
    automationWorkspace: vi.fn<DesktopBrowserHost["automationWorkspace"]>(
      () => ({ workspaceId, current: () => live })
    ),
  };
  const tools = new DesktopBrowserTools(
    browser as unknown as DesktopBrowserHost,
    viewer
  );
  const { event } = workbench();
  const resolving = tools.resolveFxPreview(event.sender, entry);
  await status.promise;
  live = false;
  pending.resolve({
    kind: "fx-service-status-v1",
    protocol_version: 1,
    project_id: project,
    state: "running",
    instance_id: "c".repeat(64),
    url: "http://127.0.0.1:8888/",
  });
  await expect(resolving).resolves.toEqual({ state: "unavailable" });
  expect(browser.automationWorkspace).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ sender: event.sender, frame: event.senderFrame })
  );
  expect(root).toHaveBeenCalledWith(workspaceId);
});

it("pins the native browser capability and closes the lease with its endpoint", async () => {
  const endpoints = new NativeEditorSurfaceEndpoints();
  const browser: DesktopBrowserToolLease = {
    ready: vi.fn<() => boolean>(() => true),
    invoke: vi.fn<DesktopBrowserToolLease["invoke"]>(async () => ({
      disposition: "dispatched_verified" as const,
      data: { ready: true },
    })),
    close: vi.fn<() => void>(),
  };
  const lease = endpoints.register(
    "session",
    snapshot,
    () => {},
    undefined,
    undefined,
    undefined,
    browser
  );
  const selection = lease.selection();
  expect(selection.editorBrowserTools).toBe(true);
  const request = {
    sessionId: "session",
    endpointId: selection.editorEndpointId,
    callId: pageId,
    operation: "browser_open",
    arguments: { url: "http://localhost:3000/" },
    timeoutMs: 1200,
  };
  await expect(endpoints.browserTool(request, signal)).resolves.toMatchObject({
    callId: pageId,
    result: { data: { ready: true } },
  });
  expect(browser.invoke).toHaveBeenCalledWith(
    request.operation,
    request.arguments,
    expect.any(AbortSignal)
  );
  await expect(
    endpoints.browserTool({ ...request, sessionId: "another" }, signal)
  ).resolves.toMatchObject({ result: { error: "owner_revoked" } });
  lease.close();
  expect(browser.close).toHaveBeenCalledTimes(1);
  await expect(endpoints.browserTool(request, signal)).resolves.toMatchObject({
    result: { error: "owner_revoked" },
  });
});
