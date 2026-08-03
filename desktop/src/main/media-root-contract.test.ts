// GRIDA-SEC-004 — Desktop must share one host-resolved durable media root.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DesktopMediaRoot } from "./media-root";

const supervisorSource = fs.readFileSync(
  new URL("./agent-sidecar-supervisor.ts", import.meta.url),
  "utf8"
);
const ipcHandlersSource = fs.readFileSync(
  new URL("./ipc-handlers.ts", import.meta.url),
  "utf8"
);
const sidecarSource = fs.readFileSync(
  new URL("../agent-sidecar.ts", import.meta.url),
  "utf8"
);

describe("durable media root contract", () => {
  it.each([
    {
      name: "macOS Stable",
      input: {
        platform: "darwin" as const,
        home: "/Users/ada",
        environment: {},
        insiders: false,
      },
      expected: "/Users/ada/Library/Application Support/Grida/Media",
    },
    {
      name: "macOS Insiders",
      input: {
        platform: "darwin" as const,
        home: "/Users/ada",
        environment: {},
        insiders: true,
      },
      expected: "/Users/ada/Library/Application Support/Grida Insiders/Media",
    },
    {
      name: "Windows Stable",
      input: {
        platform: "win32" as const,
        home: "C:\\Users\\ada",
        environment: { LOCALAPPDATA: "D:\\LocalData" },
        insiders: false,
      },
      expected: "D:\\LocalData\\Grida\\Media",
    },
    {
      name: "Windows Insiders fallback",
      input: {
        platform: "win32" as const,
        home: "C:\\Users\\ada",
        environment: {},
        insiders: true,
      },
      expected: "C:\\Users\\ada\\AppData\\Local\\Grida Insiders\\Media",
    },
    {
      name: "Linux Stable with XDG data home",
      input: {
        platform: "linux" as const,
        home: "/home/ada",
        environment: { XDG_DATA_HOME: "/mnt/app-data" },
        insiders: false,
      },
      expected: "/mnt/app-data/grida/media",
    },
    {
      name: "Linux Insiders fallback",
      input: {
        platform: "linux" as const,
        home: "/home/ada",
        environment: { XDG_DATA_HOME: "relative-data" },
        insiders: true,
      },
      expected: "/home/ada/.local/share/grida-insiders/media",
    },
  ])(
    "resolves $name into platform-local application data",
    ({ input, expected }) => {
      expect(DesktopMediaRoot.resolve(input)).toBe(expected);
    }
  );

  it("rejects a non-absolute home rather than resolving against cwd", () => {
    expect(() =>
      DesktopMediaRoot.resolve({
        platform: process.platform,
        home: "relative-home",
        environment: {},
        insiders: false,
      })
    ).toThrow("media-home-must-be-absolute");
  });

  it("forwards the same process-wide root to the sidecar and native host", () => {
    expect(supervisorSource).toContain(
      "private readonly media_root = DesktopMediaRoot.current"
    );
    expect(ipcHandlersSource).toContain("root: DesktopMediaRoot.current");
    expect(supervisorSource).toContain("`--media-root=${this.media_root}`");
    expect(sidecarSource).toContain('getCliArg("media-root")');
    expect(sidecarSource).toContain("fatal: missing --media-root");
    expect(sidecarSource).toContain("media_root: requiredMediaRoot");
  });

  it("uses native path semantics for the current platform", () => {
    expect(path.isAbsolute(DesktopMediaRoot.current)).toBe(true);
  });
});
