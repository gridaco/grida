import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DesktopBrowser, DESKTOP_BRIDGE_PROTOCOL } from "@grida/desktop-bridge";
import { BrowserAddressBar } from "./browser-address-bar";
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
    url: "http://localhost",
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

const entries = [
  { url: "https://alpha.test/docs", title: "Alpha docs", lastVisitedAt: 2 },
  { url: "https://beta.test/", title: "Beta", lastVisitedAt: 1 },
];
let container: HTMLDivElement;
let root: Root;
let listeners: Set<(change: DesktopBrowser.History.Change) => void>;
let api: DesktopBrowser.History.Bridge;
let navigate: ReturnType<typeof vi.fn<WorkspaceBrowserTabs["navigate"]>>;
let action: ReturnType<typeof vi.fn<WorkspaceBrowserTabs["action"]>>;
let tabs: WorkspaceBrowserTabs;
let current: DesktopBrowser.History.Entry[];
let revision: number;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  listeners = new Set();
  current = [...entries];
  revision = 0;
  api = {
    version: 1,
    query: vi.fn<DesktopBrowser.History.Bridge["query"]>(async ({ query }) => ({
      version: 1,
      revision,
      entries: current.filter((entry) =>
        `${entry.url} ${entry.title}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      ),
    })),
    remove: vi.fn<DesktopBrowser.History.Bridge["remove"]>(async ({ url }) => {
      current = current.filter((entry) => entry.url !== url);
      revision++;
      for (const listener of listeners) listener({ revision });
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  Object.defineProperty(window, "grida", {
    configurable: true,
    value: {
      protocol: DESKTOP_BRIDGE_PROTOCOL,
      caps: { native: { browser: true } },
      browser: { version: 4, presentation: "webview", history: api },
    },
  });
  navigate = vi.fn<WorkspaceBrowserTabs["navigate"]>();
  action = vi.fn<WorkspaceBrowserTabs["action"]>();
  tabs = { navigate, action } as unknown as WorkspaceBrowserTabs;
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  container.remove();
  delete (window as unknown as { grida?: unknown }).grida;
});
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
async function render(url: string | null = "https://current.test/path") {
  await act(async () =>
    root.render(
      <BrowserAddressBar
        tabs={tabs}
        id="tab"
        url={url}
        active
        focusRevision={0}
        disabled={false}
        loading={false}
      />
    )
  );
  return container.querySelector("input")!;
}
function key(target: Element, value: string, extra: KeyboardEventInit = {}) {
  const event = new window.KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  target.dispatchEvent(event);
  return event;
}
function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  set.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
const removeButton = () =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.getAttribute("aria-label")?.startsWith("Remove ")
  )!;

describe("BrowserAddressBar DOM", () => {
  it("reveals recent options before keyboard selection on an empty address", async () => {
    const input = await render(null);
    await act(async () => {
      input.focus();
      await settle();
    });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      key(input, "ArrowDown");
      await settle();
    });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const selected = container.querySelector(
      "[role=option][aria-selected=true]"
    );
    expect(selected?.textContent).toContain("Alpha docs");
    act(() => {
      key(input, "Enter");
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith("tab", entries[0].url);
  });

  it("keeps the edited draft across window refocus and subsequent page updates", async () => {
    const input = await render();
    await act(async () => {
      input.focus();
      type(input, "unfinished search");
      await settle();
    });
    act(() => {
      window.dispatchEvent(new window.Event("blur"));
      window.dispatchEvent(new window.Event("focus"));
    });
    await render("https://current.test/new-location");
    expect(input.value).toBe("unfinished search");
  });

  it.each(["before", "after"] as const)(
    "preserves the edit when input focusout occurs %s window blur",
    async (order) => {
      const input = await render();
      await act(async () => {
        input.focus();
        type(input, "unfinished search");
        await settle();
      });
      const focused = vi.spyOn(document, "hasFocus").mockReturnValue(false);
      act(() => {
        const focusout = () =>
          input.dispatchEvent(
            new window.FocusEvent("focusout", {
              bubbles: true,
              relatedTarget: null,
            })
          );
        if (order === "before") focusout();
        window.dispatchEvent(new window.Event("blur"));
        if (order === "after") focusout();
      });
      await render("https://current.test/changed-while-away");
      expect(input.value).toBe("unfinished search");
      focused.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new window.Event("focus"));
      });
      await render("https://current.test/changed-after-return");
      expect(input.value).toBe("unfinished search");
      act(() => {
        key(input, "Escape");
      });
      expect(input.value).toBe("current.test/changed-after-return");
      expect(action).toHaveBeenCalledExactlyOnceWith("tab", "focus");
    }
  );

  it("ends editing after a deliberate null-destination blur in a focused document", async () => {
    const input = await render();
    await act(async () => {
      input.focus();
      type(input, "unfinished search");
      await settle();
    });
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    act(() => {
      input.blur();
    });
    await render("https://current.test/new-location");
    expect(input.value).toBe("current.test/new-location");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("ends suspension when focus deliberately transfers to another host control", async () => {
    const input = await render();
    await act(async () => {
      input.focus();
      type(input, "unfinished search");
      await settle();
    });
    act(() => {
      window.dispatchEvent(new window.Event("blur"));
    });
    const control = document.createElement("button");
    document.body.append(control);
    act(() => {
      control.focus();
    });
    await render("https://current.test/new-location");
    expect(input.value).toBe("current.test/new-location");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    control.remove();
  });

  it("hides suggestions without input even when history is available", async () => {
    const input = await render(null);
    await act(async () => {
      input.focus();
      await settle();
    });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[role=listbox]")).toBeNull();
    await act(async () => {
      type(input, "example.test");
      await settle();
    });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[role=option]")).not.toBeNull();
    await act(async () => {
      type(input, "");
      await settle();
    });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[role=listbox]")).toBeNull();
    await act(async () => {
      type(input, "   ");
      await settle();
    });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[role=listbox]")).toBeNull();
  });

  it("selects the complete URL on focus and exposes local recent options with combobox semantics", async () => {
    const input = await render();
    expect(input.placeholder).toBe("Search or enter URL");
    expect(input.value).toBe("current.test/path");
    await act(async () => {
      input.focus();
      await settle();
    });
    expect(input.value).toBe("https://current.test/path");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(api.query).toHaveBeenCalledWith({ query: "", limit: 8 });
    act(() => {
      key(input, "ArrowDown");
      key(input, "ArrowDown");
    });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      container.querySelectorAll("[role=option]")[2].id
    );
    act(() => {
      key(input, "Enter");
    });
    expect(navigate).toHaveBeenCalledWith("tab", entries[0].url);
    expect(container.querySelector("[role=listbox]")).toBeNull();
  });

  it("submits text only after IME composition ends, with no remote typeahead", async () => {
    const input = await render(null);
    await act(async () => {
      input.focus();
      await settle();
    });
    act(() => {
      input.dispatchEvent(
        new window.CompositionEvent("compositionstart", { bubbles: true })
      );
      type(input, "한글 검색");
      key(input, "Enter", { isComposing: true });
    });
    expect(navigate).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(navigate).not.toHaveBeenCalled();
    act(() => {
      input.dispatchEvent(
        new window.CompositionEvent("compositionend", { bubbles: true })
      );
      key(input, "Enter");
    });
    expect(navigate).toHaveBeenCalledWith(
      "tab",
      "https://www.google.com/search?q=%ED%95%9C%EA%B8%80%20%EA%B2%80%EC%83%89"
    );
    expect(api.query).toHaveBeenCalledWith({ query: "한글 검색", limit: 8 });
  });

  it("supports keyboard-reachable remove controls, Escape, and input focus after deletion", async () => {
    const input = await render();
    await act(async () => {
      input.focus();
      await settle();
    });
    act(() => removeButton().focus());
    expect(input.getAttribute("aria-expanded")).toBe("true");
    act(() => {
      key(removeButton(), "Escape");
    });
    expect(container.querySelector("[role=listbox]")).toBeNull();
    expect(action).toHaveBeenCalledWith("tab", "focus");
    await act(async () => {
      input.focus();
      await settle();
    });
    await act(async () => {
      const remove = removeButton();
      remove.focus();
      remove.click();
      await settle();
    });
    expect(document.activeElement).toBe(input);
    expect(api.remove).toHaveBeenCalledWith({ url: entries[0].url });
    expect(container.textContent).not.toContain("Alpha docs");
  });

  it("closes on focus leaving a remove control and cancels delayed query observation", async () => {
    const input = await render();
    await act(async () => {
      input.focus();
      await settle();
    });
    act(() => removeButton().focus());
    const outside = document.createElement("button");
    document.body.append(outside);
    act(() => outside.focus());
    expect(container.querySelector("[role=listbox]")).toBeNull();
    expect(listeners.size).toBe(0);
    let resolve!: (snapshot: DesktopBrowser.History.Snapshot) => void;
    api.query = () =>
      new Promise((done) => {
        resolve = done;
      });
    act(() => input.focus());
    act(() => outside.focus());
    await act(async () => {
      resolve({ version: 1, revision: 1, entries });
      await settle();
    });
    expect(container.querySelector("[role=listbox]")).toBeNull();
    expect(listeners.size).toBe(0);
    outside.remove();
  });

  it("keeps ordinary Shift+Delete editing unless a history row is selected", async () => {
    const input = await render();
    await act(async () => {
      input.focus();
      await settle();
    });
    let event!: KeyboardEvent;
    act(() => {
      event = key(input, "Delete", { shiftKey: true });
    });
    expect(event.defaultPrevented).toBe(false);
    act(() => {
      key(input, "ArrowDown");
      key(input, "ArrowDown");
    });
    await act(async () => {
      event = key(input, "Delete", { shiftKey: true });
      await settle();
    });
    expect(event.defaultPrevented).toBe(true);
    expect(api.remove).toHaveBeenCalledWith({ url: entries[0].url });
  });

  it("keeps URL and Google actions on a v3 host without history", async () => {
    (
      window as unknown as { grida: { browser: { history?: unknown } } }
    ).grida.browser.history = undefined;
    const input = await render();
    act(() => input.focus());
    expect(container.querySelectorAll("[role=option]")).toHaveLength(2);
    act(() => {
      key(input, "Enter");
    });
    expect(navigate).toHaveBeenCalledWith("tab", "https://current.test/path");
    expect(api.query).not.toHaveBeenCalled();
  });
});
