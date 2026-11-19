import { describe, expect, it } from "vitest";
import { DesktopCompatibility } from "./compatibility";

describe("Desktop compatibility policy", () => {
  const dormant = {
    minimumSupportedVersion: null,
    updateVersion: null,
  };
  const active = {
    minimumSupportedVersion: "0.7.0",
    updateVersion: "0.7.4",
  };

  it("enforces the minimum release line independently from the update target", () => {
    expect(DesktopCompatibility.parse(dormant)).toEqual(dormant);
    expect(
      DesktopCompatibility.parse({ ...dormant, updateVersion: "0.7.0" })
    ).toEqual({ ...dormant, updateVersion: "0.7.0" });
    expect(DesktopCompatibility.parse(active)).toEqual(active);
    expect(DesktopCompatibility.requiresUpdate("0.6.98", dormant)).toBe(false);
    expect(DesktopCompatibility.requiresUpdate("0.6.98", active)).toBe(true);
    expect(DesktopCompatibility.requiresUpdate("0.7.0-rc.2", active)).toBe(
      true
    );
    expect(DesktopCompatibility.requiresUpdate("0.7.0", active)).toBe(false);
    expect(DesktopCompatibility.requiresUpdate("0.7.3", active)).toBe(false);
    expect(DesktopCompatibility.requiresUpdate("0.10.0", active)).toBe(false);
    expect(DesktopCompatibility.requiresUpdate("", active)).toBe(true);
  });

  it.each([
    null,
    {},
    { ...active, updateVersion: null },
    { ...active, updateVersion: "0.6.99" },
    { ...active, updateVersion: "0.7.0-rc.1" },
    { ...active, updateVersion: "0.7.0\n" },
    { ...active, updateVersion: "https://example.com" },
    { ...active, minimumSupportedVersion: "0.7.1" },
    { ...active, minimumSupportedVersion: "0.07.0" },
    { ...active, minimumSupportedVersion: "9007199254740992.7.0" },
  ])("rejects invalid policy %j", (policy) => {
    expect(DesktopCompatibility.parse(policy)).toBeNull();
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
