import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DesktopBrowser, DESKTOP_BRIDGE_PROTOCOL } from "@grida/desktop-bridge";
import { BrowserGuestMounts } from "./browser-guest-mounts";
import { BrowserPageControls } from "@/lib/desktop/browser-page-controls";
import { BrowserPane } from "./browser-pane";
import { WorkspaceBrowserSession } from "./workspace-browser-session";
import { WorkspaceBrowserTabs } from "./workspace-browser-tabs";
import { EditorGroup } from "./editor-group";
import { WorkbenchPanelTab } from "./workbench-panel-tab";
import { BrowserFindBar } from "./browser-find-bar";

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
    expect(guest.hasAttribute("allowpopups")).toBe(true);
    expect(guest.hasAttribute("preload")).toBe(false);
    expect(guest.hasAttribute("webpreferences")).toBe(false);
    expect(guest.hasAttribute("partition")).toBe(false);
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
      controls: () => new BrowserPageControls.Controller(() => null),
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

  it("keeps the connected node through close-button Stay and waits for middle-click consent", async () => {
    const page = entry().page!;
    let outcome!: (event: DesktopBrowser.Event) => void;
    let finish!: (accepted: boolean) => void;
    const close = vi.fn<DesktopBrowser.Bridge["close"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const host = {
      attach: async () => ({
        version: 4,
        attachmentId: "owner",
        revision: 0,
        pages: [],
      }),
      snapshot: async () => ({
        version: 4,
        attachmentId: "owner",
        revision: 0,
        pages: [],
      }),
      subscribe: (listener: (event: DesktopBrowser.Event) => void) => {
        outcome = listener;
        return () => {};
      },
      detach: async () => {},
      create: async () => {
        outcome({
          type: "changed",
          attachmentId: "owner",
          revision: page.revision,
          page,
        });
        return page;
      },
      close,
      reserveMount: async () => ({
        src: `${DesktopBrowser.MOUNT_URL_PREFIX}ticket`,
      }),
      setActive: async () => {},
    } as unknown as DesktopBrowser.Bridge;
    const group = new EditorGroup();
    const tabs = new WorkspaceBrowserTabs(
      "workspace",
      group,
      () => host,
      () => "tab"
    );
    await tabs.start(
      { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      async () => []
    );
    tabs.open("https://example.com/");
    await settle();
    const owner = new BrowserGuestMounts(document, tabs);
    owners.push(owner);
    tabs.mounts = owner;
    tabs.subscribe(() => owner.reconcile(tabs.getSnapshot().entries));
    const shell = document.createElement("div");
    shell.tabIndex = -1;
    const slot = document.createElement("div");
    shell.append(slot);
    document.body.append(shell);
    owner.connect("tab", slot, shell);
    owner.update(tabs.getSnapshot().entries.get("tab")!, true);
    await settle();
    const guest = document.querySelector("webview")!;
    outcome({
      type: "changed",
      attachmentId: "owner",
      revision: 2,
      page: { ...page, revision: 2, mounted: true },
    });
    const source = guest.getAttribute("src");
    const write = vi.spyOn(guest, "setAttribute");
    const strip = document.createElement("div");
    document.body.append(strip);
    const root = createRoot(strip);
    act(() =>
      root.render(
        <WorkbenchPanelTab
          title="Example"
          active
          onSelect={() => {}}
          onClose={() => {
            void tabs.close("tab");
          }}
        />
      )
    );
    act(() => strip.querySelector("button")!.click());
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(group.getSnapshot().tabs).toEqual(["browser:tab"]);
    expect(guest.isConnected).toBe(true);
    finish(false);
    await tabs.close("tab");
    expect(document.querySelector("webview")).toBe(guest);
    expect(guest.getAttribute("src")).toBe(source);
    expect(write).not.toHaveBeenCalledWith("src", expect.anything());
    act(() =>
      strip
        .querySelector("[role=tab]")!
        .dispatchEvent(
          new dom.window.MouseEvent("mousedown", { bubbles: true, button: 1 })
        )
    );
    await settle();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    expect(guest.isConnected).toBe(true);
    finish(true);
    await tabs.close("tab");
    expect(group.getSnapshot().tabs).toEqual([]);
    expect(guest.isConnected).toBe(false);
    act(() => root.unmount());
    tabs.stop();
  });

  it("focuses find text, respects IME Enter and dismisses Escape from descendant controls", async () => {
    const target = { attachmentId: "owner", pageId: "page" };
    const find = vi.fn<DesktopBrowser.Utilities.Bridge["find"]>(async () => ({
      matches: 1,
      activeMatchOrdinal: 1,
    }));
    const controls = new BrowserPageControls.Controller(() => ({
      api: {
        version: 1,
        find,
        stopFind: async () => {},
      } as unknown as DesktopBrowser.Utilities.Bridge,
      target,
      revision: 0,
    }));
    const focusPage = vi.fn<() => void>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = () =>
      root.render(
        <BrowserFindBar
          controls={controls}
          state={controls.read()}
          focusPage={focusPage}
        />
      );
    controls.openFind();
    controls.setText("word");
    await settle();
    act(render);
    const input = host.querySelector<HTMLInputElement>("input")!;
    expect(document.activeElement).toBe(input);
    find.mockClear();
    act(() =>
      input.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          isComposing: true,
        })
      )
    );
    expect(find).not.toHaveBeenCalled();
    act(() =>
      input.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          shiftKey: true,
        })
      )
    );
    expect(find).toHaveBeenCalledWith({
      ...target,
      text: "word",
      forward: false,
      findNext: true,
      matchCase: false,
    });
    act(() =>
      host.querySelector("button")!.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        })
      )
    );
    expect(controls.read().findOpen).toBe(false);
    expect(focusPage).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    controls.dispose();
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
  it("releases failed initialization subscriptions before retrying", async () => {
    const session = WorkspaceBrowserSession.for(document, "workspace");
    const unwatch = vi.fn<() => void>();
    const unsubscribeNavigation = vi.fn<() => void>();
    vi.spyOn(session.browsers, "subscribe").mockReturnValue(unwatch);
    vi.spyOn(session.browsers, "start")
      .mockRejectedValueOnce(new Error("file resolution failed"))
      .mockResolvedValue();
    vi.stubGlobal("window", {
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        window: { navigation: { subscribe: () => unsubscribeNavigation } },
      },
    });
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    await expect(session.start(storage, async () => [])).rejects.toThrow(
      "file resolution failed"
    );
    expect(unwatch).toHaveBeenCalledTimes(1);
    expect(unsubscribeNavigation).toHaveBeenCalledTimes(1);
    await session.start(storage, async () => []);
    session.dispose();
    expect(unwatch).toHaveBeenCalledTimes(2);
    expect(unsubscribeNavigation).toHaveBeenCalledTimes(2);
  });

  it("does not activate an older file request that resolves after a newer one", async () => {
    const session = WorkspaceBrowserSession.for(document, "workspace");
    vi.spyOn(session.browsers, "start").mockResolvedValue();
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    await session.start(storage, async () => []);
    const pending = new Map<string, (paths: readonly string[]) => void>();
    const resolveFiles = (paths: readonly string[]) =>
      new Promise<readonly string[]>((resolve) => {
        pending.set(paths[0], resolve);
      });
    const first = session.start(storage, resolveFiles, "a.svg");
    const second = session.start(storage, resolveFiles, "b.svg");
    await settle();
    pending.get("b.svg")!(["b.svg"]);
    await second;
    pending.get("a.svg")!(["a.svg"]);
    await first;
    expect(session.group.getSnapshot().active).toBe("file:b.svg");
    expect(session.group.getSnapshot().tabs).toEqual(["file:b.svg"]);
    session.dispose();
  });

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
      version: 4,
      presentation: "webview",
      attach: vi.fn<DesktopBrowser.Bridge["attach"]>(async () => ({
        version: 4,
        attachmentId: `owner${++sequence}`,
        revision: 0,
        pages: [],
      })),
      snapshot: async (attachmentId: string) => ({
        version: 4,
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
