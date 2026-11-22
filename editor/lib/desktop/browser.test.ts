import { afterEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_BRIDGE_PROTOCOL } from "@grida/desktop-bridge";
import { Browser } from "./browser";
import { BrowserLinkPreferences } from "./browser-link-preferences";

describe("Browser.address", () => {
  it("accepts explicit HTTP(S), localhost and ordinary hostname input", () => {
    expect(Browser.address(" https://example.com/docs ")).toBe(
      "https://example.com/docs"
    );
    expect(Browser.address("example.com:8443/path")).toBe(
      "https://example.com:8443/path"
    );
    expect(Browser.address("localhost:3000")).toBe("http://localhost:3000/");
    expect(Browser.address("127.0.0.1:8787/view")).toBe(
      "http://127.0.0.1:8787/view"
    );
    expect(Browser.address("[::1]:3000")).toBe("http://[::1]:3000/");
  });
  it("rejects privileged schemes, credentials and control characters", () => {
    for (const input of [
      "javascript:alert(1)",
      "file:///tmp/test",
      "grida-workspace://file",
      "https://user:password@example.com",
      "https://example.com/\nattack",
      "",
    ])
      expect(Browser.address(input)).toBeNull();
  });
  it("classifies ordinary text, search operators and bare email as explicit Google submissions", () => {
    for (const query of [
      "design systems",
      "site:grida.co browser",
      "filetype:pdf typography",
      "intitle:design",
      "before:2026",
      "after:2025",
      "TypeError: Cannot read properties of undefined",
      "Error: connection refused",
      "hello@example.com",
      "한글 검색",
    ]) {
      expect(Browser.destination(query)?.kind).toBe("search");
      expect(Browser.address(query)).toBe(
        `https://www.google.com/search?q=${encodeURIComponent(query)}`
      );
    }
  });
  it("rejects generated locations at typed ingress even though native pages may display them", () => {
    for (const url of [
      "about:blank",
      "about:srcdoc",
      "data:text/html,hello",
      "blob:https://example.com/id",
      "blob:null/id",
      "grida-browser-mount://ticket",
    ])
      expect(Browser.destination(url)).toBeNull();
  });
  it("recognizes local IP/port addresses and rejects unsafe or credential inputs", () => {
    expect(Browser.address("192.168.0.4:8080/test")).toBe(
      "http://192.168.0.4:8080/test"
    );
    expect(Browser.address("dev-server:5173")).toBe("http://dev-server:5173/");
    for (const input of [
      "user:pass@host",
      "https://user@host/",
      "javascript: alert(1)",
      "custom:payload",
      "custom://host",
      "mailto:hello@example.com",
      "\u0000query",
      "query\n",
      "example.com:99999",
    ])
      expect(Browser.destination(input)).toBeNull();
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Browser.opener", () => {
  const local = "http://localhost:4173";

  function exposeWindow(values = new Map<string, string>()) {
    const openExternal = vi
      .fn<(url: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const target = Object.assign(new EventTarget(), {
      grida: {
        protocol: DESKTOP_BRIDGE_PROTOCOL,
        shell: { open_external: openExternal },
      },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    vi.stubGlobal("window", target);
    return { target, openExternal };
  }

  it("opens web links in the system browser and local links in Grida by default", () => {
    const { openExternal } = exposeWindow();
    const openInWorkbench = vi
      .fn<(url: string) => boolean>()
      .mockReturnValue(true);
    const openLink = Browser.opener(openInWorkbench);
    const web = "https://example.com/docs?q=design#examples";
    expect(openLink(local)).toBe(true);
    expect(openLink(web)).toBe(true);
    expect(openInWorkbench).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:4173/"
    );
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(web);
  });

  it("uses the system browser when the workbench cannot take the default request", () => {
    const { openExternal } = exposeWindow();
    expect(Browser.opener(() => false)(local)).toBe(true);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:4173/"
    );
  });

  it("honors an explicit system browser request", () => {
    const { openExternal } = exposeWindow();
    const openInWorkbench = vi
      .fn<(url: string) => boolean>()
      .mockReturnValue(true);
    expect(Browser.opener(openInWorkbench)(local, "system")).toBe(true);
    expect(openInWorkbench).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:4173/"
    );
  });

  it("uses independent preferences and reads the latest choice on each click", () => {
    const values = new Map<string, string>();
    exposeWindow(values);
    BrowserLinkPreferences.set("web", "grida");
    BrowserLinkPreferences.set("local", "system");
    // A newly opened Desktop window sees the existing saved values.
    const { openExternal } = exposeWindow(values);
    const openInWorkbench = vi
      .fn<(url: string) => boolean>()
      .mockReturnValue(true);
    const openLink = Browser.opener(openInWorkbench);
    const web = "https://example.com:8080/docs?q=design#examples";

    expect(openLink(web)).toBe(true);
    expect(openLink(local)).toBe(true);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(`${local}/`);
    expect(openInWorkbench).toHaveBeenCalledExactlyOnceWith(web);

    BrowserLinkPreferences.set("local", "grida");
    BrowserLinkPreferences.set("web", "system");
    expect(openLink(local)).toBe(true);
    expect(openLink(web)).toBe(true);
    expect(openExternal).toHaveBeenLastCalledWith(web);
    expect(openInWorkbench).toHaveBeenLastCalledWith(`${local}/`);
    expect(openLink(web, "grida")).toBe(true);
    expect(openInWorkbench).toHaveBeenLastCalledWith(web);
  });

  it("chooses the local policy for loopback hosts with or without a port", () => {
    const { openExternal } = exposeWindow();
    BrowserLinkPreferences.set("web", "grida");
    BrowserLinkPreferences.set("local", "system");
    const openInWorkbench = vi
      .fn<(url: string) => boolean>()
      .mockReturnValue(true);
    const openLink = Browser.opener(openInWorkbench);
    const localUrls = [
      "http://localhost/",
      "https://example.localhost:3000/",
      "http://localhost./",
      "http://127.5.0.7/",
      "http://[::1]:4444/",
      "http://0.0.0.0:3000/",
    ];
    const webUrls = [
      "https://localhost.example.com:3000/",
      "http://127.example.com/",
      "http://192.168.1.1:3000/",
    ];
    for (const url of [...localUrls, ...webUrls])
      expect(openLink(url)).toBe(true);
    expect(openExternal.mock.calls.flat()).toEqual(localUrls);
    expect(openInWorkbench.mock.calls.flat()).toEqual(webUrls);
  });

  it("notifies settings of writes from this and other windows", () => {
    const values = new Map<string, string>();
    const { target } = exposeWindow(values);
    const listener = vi.fn<typeof BrowserLinkPreferences.read>(
      BrowserLinkPreferences.read
    );
    const unsubscribe = BrowserLinkPreferences.subscribe(listener);

    BrowserLinkPreferences.set("web", "system");
    expect(listener).toHaveReturnedWith({ web: "system", local: "grida" });

    exposeWindow(values);
    BrowserLinkPreferences.set("local", "system");
    const key = [...values.keys()][1];
    target.dispatchEvent(Object.assign(new Event("storage"), { key }));
    expect(listener).toHaveLastReturnedWith({ web: "system", local: "system" });

    unsubscribe();
    target.dispatchEvent(Object.assign(new Event("storage"), { key }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("leaves requests with no destination unhandled and refuses non-web URLs", () => {
    vi.stubGlobal("window", undefined);
    expect(Browser.opener()(local)).toBe(false);

    const { openExternal } = exposeWindow();
    const openInWorkbench = vi
      .fn<(url: string) => boolean>()
      .mockReturnValue(true);
    const openLink = Browser.opener(openInWorkbench);
    for (const url of [
      "localhost:4173",
      "grida://auth/callback",
      "file:///tmp/a",
      "https://user:password@example.com",
    ])
      expect(openLink(url)).toBe(false);
    expect(openInWorkbench).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("Browser capability negotiation", () => {
  it("accepts only the v4 shared-profile presentation and never exposes old native APIs", () => {
    const expose = (browser: unknown) =>
      vi.stubGlobal("window", {
        grida: {
          protocol: DESKTOP_BRIDGE_PROTOCOL,
          caps: { native: { browser: true } },
          browser,
        },
      });
    expose({
      version: 1,
      layout: () => {
        throw new Error("old host called");
      },
    });
    expect(Browser.getBridge()).toBeNull();
    expose({
      version: 2,
      presentation: "webview",
      clearSession: () => {
        throw new Error("old scoped clear called");
      },
    });
    expect(Browser.getBridge()).toBeNull();
    expose({ version: 3, presentation: "webview" });
    expect(Browser.getBridge()).toBeNull();
    expose({ version: 4, presentation: "native" });
    expect(Browser.getBridge()).toBeNull();
    const current = { version: 4, presentation: "webview" };
    expose(current);
    expect(Browser.getBridge()).toBe(current);
  });
});
