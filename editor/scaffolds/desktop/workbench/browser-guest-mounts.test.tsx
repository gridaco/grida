import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DesktopBrowser, DESKTOP_BRIDGE_PROTOCOL } from "@grida/desktop-bridge";
import { BrowserGuestMounts } from "./browser-guest-mounts";
import { BrowserPane } from "./browser-pane";
import { WorkspaceBrowserSession } from "./workspace-browser-session";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";

const dom = await vi.hoisted(async () => {
  // Match existing DOM component tests: canvas is an unused optional peer.
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const environmentRequire = createRequire(
    require.resolve("vitest/package.json")
  );
  const jsdomPath = environmentRequire.resolve("jsdom");
  const domRequire = createRequire(jsdomPath);
  let canvasPath: string | undefined;
  let canvasEntry: NodeJS.Module | undefined;
  try {
    canvasPath = domRequire.resolve("canvas");
    canvasEntry = require.cache[canvasPath];
    require.cache[canvasPath] = {
      exports: { createCanvas: undefined },
      loaded: true,
    } as unknown as NodeJS.Module;
  } catch {
    /* Some installations omit the optional peer. */
  }
  const { JSDOM } = domRequire(jsdomPath);
  if (canvasPath) {
    if (canvasEntry) require.cache[canvasPath] = canvasEntry;
    else delete require.cache[canvasPath];
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/desktop/workspace?id=workspace",
  });
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "navigator",
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: dom.window[key],
    });
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
  });
  return dom;
});
afterAll(() => dom.window.close());

const entry = (
  overrides: Partial<DesktopBrowser.Page> = {}
): WorkspaceBrowserTabs.Entry => ({
  id: "tab",
  url: "https://example.com/",
  storageScope: "workspace",
  error: null,
  locationRevision: 0,
  page: {
    id: "page",
    mounted: false,
    revision: 1,
    url: "https://example.com/",
    title: "Example",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    focused: false,
    storageScope: "workspace",
    failure: null,
    ...overrides,
  },
});
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const owners: BrowserGuestMounts[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom.reconfigure({ url: "http://localhost/desktop/workspace?id=workspace" });
});
const setup = () => {
  const reserveMount = vi.fn<BrowserGuestMounts.Commands["reserveMount"]>(
    async () => ({
      src: `${DesktopBrowser.MOUNT_URL_PREFIX}ticket`,
    })
  );
  const setActive = vi.fn<BrowserGuestMounts.Commands["setActive"]>();
  const owner = new BrowserGuestMounts(document, { reserveMount, setActive });
  owners.push(owner);
  const slot = document.createElement("div");
  const focus = document.createElement("div");
  focus.className = "grida-content-frame";
  focus.tabIndex = -1;
  document.body.append(slot, focus);
  return { owner, reserveMount, setActive, slot, focus };
};

describe("BrowserGuestMounts", () => {
  it("keeps one connected node and bootstrap across StrictMode and a React-root remount", async () => {
    const { owner, reserveMount } = setup();
    const container = document.createElement("div");
    document.body.append(container);
    const initial = entry();
    function Pane() {
      useLayoutEffect(() => {
        const slot = document.getElementById("slot")!;
        const focus = document.getElementById("focus")!;
        const disconnect = owner.connect("tab", slot, focus);
        owner.update(initial, true);
        return disconnect;
      }, []);
      return (
        <div>
          <div id="focus" tabIndex={-1} />
          <div id="slot" />
        </div>
      );
    }
    let root = createRoot(container);
    await act(async () => {
      root.render(
        <StrictMode>
          <Pane />
        </StrictMode>
      );
      await settle();
    });
    const guest = document.querySelector("webview")!;
    const wrapper = guest.parentElement!;
    const src = guest.getAttribute("src");
    const write = vi.spyOn(guest, "setAttribute");
    act(() => root.unmount());
    expect(guest.isConnected).toBe(true);
    expect(wrapper.style.visibility).toBe("hidden");
    root = createRoot(container);
    await act(async () => {
      root.render(<Pane />);
      await settle();
    });
    expect(document.querySelector("webview")).toBe(guest);
    expect(guest.getAttribute("src")).toBe(src);
    expect(write).not.toHaveBeenCalledWith("src", expect.anything());
    expect(reserveMount).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("focuses a real shell element and disables input before hiding; modal locking inherits", async () => {
    const { owner, slot, focus, setActive } = setup();
    const release = owner.connect("tab", slot, focus);
    owner.update(entry(), true);
    await settle();
    const guest = document.querySelector<HTMLElement>("webview")!;
    const wrapper = guest.parentElement!;
    guest.focus();
    expect(document.activeElement).toBe(guest);
    document.body.style.pointerEvents = "none";
    expect(wrapper.style.pointerEvents).toBe("inherit");
    expect(wrapper.parentElement!.style.pointerEvents).toBe("");
    release();
    expect(document.activeElement).toBe(focus);
    expect(wrapper.inert).toBe(true);
    expect(guest.tabIndex).toBe(-1);
    expect(wrapper.style.visibility).toBe("hidden");
    expect(setActive.mock.calls).toEqual([
      ["tab", true],
      ["tab", false],
    ]);
    document.body.style.pointerEvents = "";
  });

  it("ignores stale presentation cleanup after moving to another anchor", async () => {
    const { owner, slot, focus, reserveMount } = setup();
    const stale = owner.connect("tab", slot, focus);
    owner.update(entry(), true);
    await settle();
    const guest = document.querySelector("webview")!;
    const moved = document.createElement("div");
    document.body.append(moved);
    const release = owner.connect("tab", moved, focus);
    const anchor =
      guest.parentElement!.style.getPropertyValue("position-anchor");
    stale();
    expect(guest.parentElement!.style.visibility).toBe("visible");
    expect(guest.parentElement!.style.getPropertyValue("position-anchor")).toBe(
      anchor
    );
    expect(reserveMount).toHaveBeenCalledTimes(1);
    release();
    expect(guest.isConnected).toBe(true);
    expect(guest.parentElement!.style.visibility).toBe("hidden");
  });

  it("never remounts a failed guest until an explicit retry clears failure", async () => {
    const { owner, slot, focus, reserveMount } = setup();
    owner.connect("tab", slot, focus);
    owner.update(entry(), true);
    await settle();
    const first = document.querySelector("webview")!;
    owner.update(entry({ mounted: true }), true);
    const failed = entry({
      mounted: false,
      failure: { kind: "renderer-gone", code: "gone", message: "Page closed" },
    });
    owner.reconcile(new Map([["tab", failed]]));
    expect(first.isConnected).toBe(false);
    expect(reserveMount).toHaveBeenCalledTimes(1);
    owner.reconcile(new Map([["tab", entry()]]));
    await settle();
    expect(document.querySelector("webview")).not.toBe(first);
    expect(reserveMount).toHaveBeenCalledTimes(2);
    owner.reconcile(new Map());
    expect(document.querySelector("webview")).toBeNull();
  });

  it("releases an unacknowledged failed mount so explicit retry can reserve again", async () => {
    const { owner, slot, focus, reserveMount } = setup();
    owner.connect("tab", slot, focus);
    owner.update(entry(), true);
    await settle();
    const first = document.querySelector("webview")!;
    owner.update(
      entry({
        failure: { kind: "mount", code: "expired", message: "Mount expired" },
      }),
      true
    );
    expect(first.isConnected).toBe(false);
    owner.update(entry(), true);
    await settle();
    expect(document.querySelector("webview")).not.toBe(first);
    expect(reserveMount).toHaveBeenCalledTimes(2);
  });

  it("retains the live guest through address validation and action errors", async () => {
    const { owner, slot, focus, reserveMount } = setup();
    owner.connect("tab", slot, focus);
    owner.update(entry(), true);
    await settle();
    const guest = document.querySelector("webview")!;
    const mounted = entry({ mounted: true });
    owner.update(mounted, true);
    const source = guest.getAttribute("src");
    const write = vi.spyOn(guest, "setAttribute");
    owner.update(
      { ...mounted, error: "Enter an HTTP or HTTPS address." },
      true
    );
    expect(guest.isConnected).toBe(true);
    expect(guest.parentElement!.style.visibility).toBe("visible");
    owner.update(mounted, true);
    expect(document.querySelector("webview")).toBe(guest);
    expect(guest.getAttribute("src")).toBe(source);
    expect(write).not.toHaveBeenCalledWith("src", expect.anything());
    expect(reserveMount).toHaveBeenCalledTimes(1);
  });

  it("shows an action error below the toolbar without a page reload placeholder", async () => {
    const { owner, slot, focus } = setup();
    owner.connect("tab", slot, focus);
    owner.update(entry(), true);
    await settle();
    const guest = document.querySelector("webview")!;
    const container = document.createElement("div");
    container.className = "grida-content-frame";
    container.tabIndex = -1;
    document.body.append(container);
    const root = createRoot(container);
    const tabs = {
      mounts: owner,
      getSnapshot: () => ({ supported: true, error: null }),
    } as unknown as WorkspaceBrowserTabs;
    act(() =>
      root.render(
        <BrowserPane
          tabs={tabs}
          entry={{
            ...entry({ mounted: true }),
            error: "Enter an HTTP or HTTPS address.",
          }}
          active
        />
      )
    );
    const alert = container.querySelector("[role=alert]")!;
    expect(alert.textContent).toBe("Enter an HTTP or HTTPS address.");
    expect(alert.parentElement?.querySelector("form")).not.toBeNull();
    expect(container.textContent).not.toContain("Try again");
    expect(guest.isConnected).toBe(true);
    expect(guest.parentElement!.style.visibility).toBe("visible");
    act(() => root.unmount());
  });

  it("does not connect a late mount after its page closes", async () => {
    const { owner, slot, focus, reserveMount } = setup();
    let resolve!: (mount: DesktopBrowser.GuestMount) => void;
    reserveMount.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    owner.connect("tab", slot, focus);
    owner.update(entry(), true);
    owner.reconcile(new Map());
    resolve({ src: `${DesktopBrowser.MOUNT_URL_PREFIX}late` });
    await settle();
    expect(document.querySelector("webview")).toBeNull();
  });
});

describe("WorkspaceBrowserSession document ownership", () => {
  it("reuses group/controller across UI remounts, drops stale panels, and detaches only on disposal", async () => {
    const session = WorkspaceBrowserSession.for(document, "workspace");
    const start = vi.spyOn(session.browsers, "start").mockResolvedValue();
    const stop = vi.spyOn(session.browsers, "stop");
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const release = session.bindUI({});
    await session.start(storage, async () => []);
    session.group.open("file:brief.md");
    session.group.open("browser:tab");
    session.group.open("panel:transient");
    release();
    expect(stop).not.toHaveBeenCalled();
    const reacquired = WorkspaceBrowserSession.for(document, "workspace");
    expect(reacquired).toBe(session);
    reacquired.bindUI({});
    await reacquired.start(storage, async () => []);
    expect(start).toHaveBeenCalledTimes(1);
    expect(session.group.getSnapshot().tabs).toEqual([
      "file:brief.md",
      "browser:tab",
    ]);
    session.dispose();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(WorkspaceBrowserSession.for(document, "workspace")).not.toBe(
      session
    );
  });
  it("reattaches after a route roundtrip even when history flags are unchanged", async () => {
    let navigation!: () => void;
    let sequence = 0;
    const browser = {
      version: 2,
      presentation: "webview",
      attach: vi.fn<DesktopBrowser.Bridge["attach"]>(async () => ({
        version: 2,
        attachmentId: `owner${++sequence}`,
        revision: 0,
        pages: [],
      })),
      snapshot: async (attachmentId: string) => ({
        version: 2,
        attachmentId,
        revision: 0,
        pages: [],
      }),
      subscribe: () => () => {},
      detach: vi.fn<DesktopBrowser.Bridge["detach"]>(async () => {}),
    };
    vi.stubGlobal("window", {
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        caps: { native: { browser: true } },
        browser,
        window: {
          navigation: {
            subscribe: (handler: () => void) => {
              navigation = handler;
              return () => {};
            },
          },
        },
      },
    });
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const first = WorkspaceBrowserSession.for(document, "workspace");
    await first.start(storage, async () => []);
    expect(browser.attach).toHaveBeenCalledTimes(1);
    dom.reconfigure({ url: "http://localhost/desktop/settings" });
    // The native publisher emits completed URL changes, even when its history
    // booleans are unchanged. The payload itself carries no URL authority.
    navigation();
    expect(browser.detach).toHaveBeenCalledTimes(1);
    dom.reconfigure({ url: "http://localhost/desktop/workspace?id=workspace" });
    const returned = WorkspaceBrowserSession.for(document, "workspace");
    expect(returned).not.toBe(first);
    await returned.start(storage, async () => []);
    expect(browser.attach).toHaveBeenCalledTimes(2);
    returned.dispose();
  });
});
