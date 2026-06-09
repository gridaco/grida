import { describe, expect, it } from "vitest";

import { open_handoff } from "./open-handoff";

// The cross-instance forward contract. The secondary `encode`s the opens it
// captured (macOS `open-file` / Win-Linux argv) and the primary `decode`s them
// off the `second-instance` event's `additionalData`. These run in different
// processes, so the only guarantee is this codec — test it like a protocol.

describe("open_handoff.isSupportedFile", () => {
  it("accepts .svg and .grida, case-insensitively", () => {
    expect(open_handoff.isSupportedFile("/a/b/c.svg")).toBe(true);
    expect(open_handoff.isSupportedFile("/a/b/c.grida")).toBe(true);
    expect(open_handoff.isSupportedFile("/a/b/C.SVG")).toBe(true);
  });

  it("rejects other extensions, the exec path, flags, and the app dir", () => {
    expect(open_handoff.isSupportedFile("/a/b/c.png")).toBe(false);
    expect(
      open_handoff.isSupportedFile("/Applications/Grida.app/.../Grida")
    ).toBe(false);
    expect(open_handoff.isSupportedFile("--insiders")).toBe(false);
    expect(open_handoff.isSupportedFile(".")).toBe(false);
  });
});

describe("open_handoff.fromArgv", () => {
  it("classifies files and grida:// urls, preserving order, ignoring noise", () => {
    const argv = [
      "/Applications/Grida.app/Contents/MacOS/Grida",
      "--some-flag",
      "grida://auth/callback?token=x",
      "/Users/u/Desktop/logo.svg",
      "/Users/u/notes.txt",
      "/Users/u/doc.grida",
    ];
    expect(open_handoff.fromArgv(argv)).toEqual([
      { kind: "url", url: "grida://auth/callback?token=x" },
      { kind: "file", path: "/Users/u/Desktop/logo.svg" },
      { kind: "file", path: "/Users/u/doc.grida" },
    ]);
  });

  it("returns [] when nothing classifies", () => {
    expect(open_handoff.fromArgv(["/exec/path", "--flag", "."])).toEqual([]);
  });
});

describe("open_handoff encode/decode round-trip", () => {
  it("round-trips a mixed list of file and url opens", () => {
    const opens: open_handoff.Open[] = [
      { kind: "file", path: "/Users/u/Desktop/logo.svg" },
      { kind: "url", url: "grida://open?x=1" },
    ];
    expect(open_handoff.decode(open_handoff.encode(opens))).toEqual(opens);
  });

  it("survives a structured-clone of the envelope (the IPC boundary)", () => {
    const opens: open_handoff.Open[] = [
      { kind: "file", path: "/a/b c/weird name.svg" },
    ];
    // additionalData crosses the process boundary as JSON-ish data; ensure the
    // envelope is plain-serializable and decodes back identically.
    const wire = JSON.parse(JSON.stringify(open_handoff.encode(opens)));
    expect(open_handoff.decode(wire)).toEqual(opens);
  });

  it("encodes an empty list to a valid (empty) envelope", () => {
    expect(open_handoff.decode(open_handoff.encode([]))).toEqual([]);
  });
});

describe("open_handoff.decode tolerance (foreign / legacy payloads)", () => {
  it("returns [] for non-envelope additionalData", () => {
    expect(open_handoff.decode(undefined)).toEqual([]);
    expect(open_handoff.decode(null)).toEqual([]);
    expect(open_handoff.decode("a string")).toEqual([]);
    expect(open_handoff.decode(42)).toEqual([]);
    expect(open_handoff.decode({})).toEqual([]);
    expect(open_handoff.decode({ some: "other app's data" })).toEqual([]);
  });

  it("returns [] when the tag is present but the version is wrong", () => {
    expect(
      open_handoff.decode({ __grida_open_handoff: "v0", opens: [] })
    ).toEqual([]);
  });

  it("drops malformed entries but keeps well-formed ones", () => {
    const wire = {
      __grida_open_handoff: "v1",
      opens: [
        { kind: "file", path: "/ok.svg" },
        { kind: "file" }, // missing path
        { kind: "file", path: "" }, // empty path
        { kind: "url" }, // missing url
        { kind: "mystery", value: 1 }, // unknown kind
        null,
        "garbage",
        { kind: "url", url: "grida://ok" },
      ],
    };
    expect(open_handoff.decode(wire)).toEqual([
      { kind: "file", path: "/ok.svg" },
      { kind: "url", url: "grida://ok" },
    ]);
  });

  it("returns [] when opens is not an array", () => {
    expect(
      open_handoff.decode({ __grida_open_handoff: "v1", opens: "nope" })
    ).toEqual([]);
  });
});
