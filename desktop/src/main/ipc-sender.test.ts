// GRIDA-SEC-004 — sender admission and diagnostic-redaction pins.
import { describe, expect, it } from "vitest";
import { ipc_sender } from "./ipc-sender";

describe("ipc_sender.isAllowed", () => {
  it.each([
    "https://grida.co/desktop",
    "https://grida.co/desktop/settings?token=secret#fragment",
  ])("accepts a Desktop path on the configured origin: %s", (url) => {
    expect(ipc_sender.isAllowed(url, "https://grida.co")).toBe(true);
  });

  it.each([
    undefined,
    "not a URL",
    "https://grida.co/",
    "https://grida.co/desktop-other",
    "https://attacker.example/desktop/settings",
  ])("rejects a sender outside the Desktop origin/path: %s", (url) => {
    expect(ipc_sender.isAllowed(url, "https://grida.co")).toBe(false);
  });
});

describe("ipc_sender.pathname", () => {
  it("extracts only the parsed pathname", () => {
    expect(
      ipc_sender.pathname(
        "https://grida.co/desktop/settings?token=secret#fragment"
      )
    ).toBe("/desktop/settings");
  });
});

describe("ipc_sender.diagnostic", () => {
  it("drops credentials, query parameters, and fragments", () => {
    expect(
      ipc_sender.diagnostic(
        "https://user:password@grida.co/desktop/auth/callback?code=secret#token"
      )
    ).toBe("https://grida.co/desktop/auth/callback");
  });

  it.each([
    [undefined, "<no frame>"],
    ["not a URL", "<invalid URL>"],
    ["grida://auth/callback?code=secret", "<grida URL>"],
  ])("uses a bounded label for %s", (url, expected) => {
    expect(ipc_sender.diagnostic(url)).toBe(expected);
  });
});
