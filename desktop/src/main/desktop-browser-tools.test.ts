// GRIDA-SEC-004 / GRIDA-SEC-016 — exact renderer publication and tooling lease.
import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { DesktopBrowserTools } from "./desktop-browser-tools";
import type { DesktopBrowserHost } from "./browser-host";
import { NativeEditorSurfaceEndpoints } from "./native-editor-surfaces";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";

vi.mock("electron", () => ({ BrowserWindow: { fromWebContents: () => null } }));
const operations = vi.hoisted(() => ({
  invoke: vi.fn<DesktopBrowserToolLease["invoke"]>(),
  closeScope: vi.fn<(id: string) => void>(),
  registerOpen: vi.fn<() => { kind: "navigation"; navigationId: string }>(),
}));
vi.mock("./browser-automation", () => ({
  BrowserAutomation: class {
    invoke = operations.invoke;
    closeScope = operations.closeScope;
    registerOpen = operations.registerOpen;
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
