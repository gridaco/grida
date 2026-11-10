// GRIDA-SEC-004 — sender admission and diagnostic-redaction pins.
import { describe, expect, it } from "vitest";
import { ipc_sender } from "./ipc-sender";

it("accepts only a single canonical workspace ID on the root deck route", () => {
  const id = "eac20941e6a410aa";
  const origin = "https://grida.co";
  const route = `${origin}/desktop/file?id=${id}`;
  expect(ipc_sender.rootDeckId(route)).toBe(id);
  for (const invalid of [
    `${route}&id=${id}`,
    `${route}&docId=file`,
    `${route}&path=`,
    `${route}&path=nested.canvas`,
    `${route}#fragment`,
    `${route}&session=other`,
    `${origin}/desktop/file?id=wrong`,
    `${origin}/desktop/workspace?id=${id}`,
  ]) {
    expect(ipc_sender.rootDeckId(invalid)).toBeNull();
  }
});

it("pins the standalone document route to one exact document query", () => {
  const origin = "https://fixture.invalid";
  expect(ipc_sender.isDocument(`${origin}/desktop/file?docId=a`, "a")).toBe(
    true
  );
  for (const path of [
    "/desktop/file?docId=a&docId=b",
    "/desktop/file?docId=a&id=eac20941e6a410aa",
    "/desktop/file?docId=a&path=nested.canvas",
    "/desktop/file?docId=a#fragment",
    "/desktop/file?docId=b",
    "/desktop/welcome?docId=a",
  ])
    expect(ipc_sender.isDocument(origin + path, "a")).toBe(false);
});

it("accepts only the issued UUID shape for standalone document chat", () => {
  const id = "c05543c0-40dd-4ca2-9a08-be6b86977e8e";
  const route = `https://grida.co/desktop/file?docId=${id}`;
  expect(ipc_sender.documentId(route)).toBe(id);
  for (const href of [
    `${route}&docId=${id}`,
    `${route}&id=eac20941e6a410aa`,
    `${route}&path=`,
    `${route}#other`,
    route.replace(id, "other"),
    route.replace(id, id.toUpperCase()),
    route.replace("/file", "/file/other"),
  ])
    expect(ipc_sender.documentId(href)).toBeNull();
});

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
