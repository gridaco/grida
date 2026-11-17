import { afterEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_BRIDGE_PROTOCOL } from "@grida/desktop-bridge";
import { Browser } from "./browser";

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
