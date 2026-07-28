/**
 * GRIDA-SEC-005 — deep-link auth callback routing.
 *
 * Pins the parser's contract: untrusted protocol input can produce only a
 * fixed same-origin callback intent, only known code/error params cross the
 * boundary, and the parser has no BrowserWindow fallback of its own.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://grida.test" }));

import { protocol_router } from "./protocol-router";

describe("protocol_router.route", () => {
  it.each([
    "not a url",
    "https://example.com/x",
    "grida://open/foo",
    "grida://auth/other?code=x",
  ])("consumes unsupported input without an app-window intent: %s", (raw) => {
    expect(protocol_router.route(raw)).toEqual({ kind: "ignored" });
  });

  it("builds the fixed same-origin callback route", () => {
    expect(protocol_router.route("grida://auth/callback?code=abc-123")).toEqual(
      {
        kind: "auth-callback",
        callback_url:
          "https://grida.test/desktop/auth/callback?code=abc-123&native_entry=1",
      }
    );
  });

  it("matches a case-varied auth host", () => {
    expect(protocol_router.route("grida://Auth/callback?code=abc-123")).toEqual(
      {
        kind: "auth-callback",
        callback_url:
          "https://grida.test/desktop/auth/callback?code=abc-123&native_entry=1",
      }
    );
  });

  it("routes the dev scheme identically", () => {
    expect(
      protocol_router.route("grida-dev://auth/callback?code=dev-123")
    ).toEqual({
      kind: "auth-callback",
      callback_url:
        "https://grida.test/desktop/auth/callback?code=dev-123&native_entry=1",
    });
  });

  it("forwards only known params and adds the native entry marker", () => {
    const route = protocol_router.route(
      "grida://auth/callback?code=abc&evil=payload&error_code=otp_expired"
    );
    expect(route.kind).toBe("auth-callback");
    if (route.kind !== "auth-callback") return;
    const target = new URL(route.callback_url);
    expect(target.origin).toBe("https://grida.test");
    expect(target.pathname).toBe("/desktop/auth/callback");
    expect(target.searchParams.get("code")).toBe("abc");
    expect(target.searchParams.get("error_code")).toBe("otp_expired");
    expect(target.searchParams.getAll("native_entry")).toEqual(["1"]);
    expect(target.searchParams.has("evil")).toBe(false);
  });

  it("never forwards or accepts a custom-scheme entry marker", () => {
    const route = protocol_router.route(
      "grida://auth/callback?code=abc&native_entry=0&native_entry=attacker"
    );
    expect(route.kind).toBe("auth-callback");
    if (route.kind !== "auth-callback") return;
    const target = new URL(route.callback_url);
    expect(target.searchParams.getAll("native_entry")).toEqual(["1"]);
  });

  it("forwards provider failure params when no code is present", () => {
    const route = protocol_router.route(
      "grida://auth/callback?error=access_denied&error_description=no"
    );
    expect(route).toEqual({
      kind: "auth-callback",
      callback_url:
        "https://grida.test/desktop/auth/callback?error=access_denied&error_description=no&native_entry=1",
    });
  });

  it("never logs malformed protocol input that may contain a code", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    protocol_router.route("not a url?code=secret-code");

    expect(JSON.stringify(warning.mock.calls)).not.toContain("secret-code");
    warning.mockRestore();
  });
});
