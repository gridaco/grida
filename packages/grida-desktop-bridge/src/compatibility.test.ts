import { describe, expect, it } from "vitest";
import { DesktopCompatibility } from "./compatibility";

describe("Desktop compatibility handshake", () => {
  const handshake = { desktopVersion: "0.8.1" };

  it("keeps the exact patch version for the installer link", () => {
    expect(DesktopCompatibility.parse(handshake)).toEqual(handshake);
  });

  it("derives the hosted compatibility version from a release candidate", () => {
    expect(DesktopCompatibility.fromBuildVersion("0.11.0-rc.1")).toEqual({
      desktopVersion: "0.11.0",
    });
    expect(DesktopCompatibility.fromBuildVersion("0.8.1")).toEqual(handshake);
    expect(DesktopCompatibility.fromBuildVersion("0.11.0-rc.01")).toBeNull();
  });

  it.each([
    ["0.7.99", "0.8.1", true],
    ["0.99.99", "1.0.0", true],
    ["0.8.0", "0.8.1", false],
    ["0.8.0-rc.2", "0.8.1", false],
    ["0.8.2", "0.8.1", false],
    ["0.10.0", "0.8.1", false],
    ["1.0.0", "0.8.1", false],
    ["", "0.8.1", true],
  ])(
    "checks installed Desktop %s against hosted version %s",
    (installed, hosted, required) => {
      expect(DesktopCompatibility.requiresUpdate(installed, hosted)).toBe(
        required
      );
    }
  );

  it.each([
    null,
    {},
    { desktopVersion: null },
    { desktopVersion: "0.8.0-rc.1" },
    { desktopVersion: "0.8.0+build" },
    { desktopVersion: "0.8.0\n" },
    { desktopVersion: "https://example.com" },
    { desktopVersion: "0.08.0" },
    { desktopVersion: "9007199254740992.8.0" },
  ])("rejects an invalid handshake %j", (value) => {
    expect(DesktopCompatibility.parse(value)).toBeNull();
  });

  it("orders versions by SemVer precedence", () => {
    const versions = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];
    for (const [i, current] of versions.entries()) {
      expect(DesktopCompatibility.compare(current, current)).toBe(0);
      for (const newer of versions.slice(i + 1)) {
        expect(DesktopCompatibility.compare(current, newer)).toBe(-1);
        expect(DesktopCompatibility.compare(newer, current)).toBe(1);
      }
    }
    expect(DesktopCompatibility.compare("1.0.0+a", "1.0.0+b")).toBe(0);
    expect(DesktopCompatibility.compare("1.0.0-alpha.01", "1.0.0")).toBeNull();
  });

  it("derives a release tag only from a stable version", () => {
    expect(DesktopCompatibility.releaseUrl("0.7.4")).toBe(
      "https://github.com/gridaco/grida/releases/tag/v0.7.4"
    );
    expect(DesktopCompatibility.releaseUrl("0.7.4-rc.1")).toBeNull();
    expect(DesktopCompatibility.releaseUrl("0.7.4+build")).toBeNull();
    expect(DesktopCompatibility.releaseUrl("0.7.4/../")).toBeNull();
  });
});
