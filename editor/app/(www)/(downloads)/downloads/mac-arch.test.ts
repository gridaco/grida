import { describe, expect, it } from "vitest";
import { macarch } from "./mac-arch";

describe("macarch.classifyRenderer", () => {
  it.each([
    "Apple GPU",
    "Apple M1",
    "Apple M2 Pro",
    "Apple M3 Max",
    "Apple M4",
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)",
    "ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)",
  ])("classifies Apple Silicon renderer %j as arm64", (renderer) => {
    expect(macarch.classifyRenderer(renderer)).toBe("arm64");
  });

  it.each([
    "Intel Iris Plus Graphics 655",
    "Intel(R) UHD Graphics 630",
    "Intel Iris OpenGL Engine",
    "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "AMD Radeon Pro 5300M OpenGL Engine",
    "ANGLE (AMD, AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)",
    "Radeon Pro 555X",
  ])("classifies Intel/AMD renderer %j as x64", (renderer) => {
    expect(macarch.classifyRenderer(renderer)).toBe("x64");
  });

  it.each([null, undefined, "", "   ", "Google SwiftShader", "llvmpipe"])(
    "returns null for unavailable or unrecognized renderer %j",
    (renderer) => {
      expect(macarch.classifyRenderer(renderer)).toBeNull();
    }
  );

  it("classifies Mesa Intel as x64", () => {
    expect(macarch.classifyRenderer("Mesa Intel")).toBe("x64");
  });

  it("returns null for generic / privacy-blocked strings", () => {
    expect(macarch.classifyRenderer("WebKit WebGL")).toBeNull();
    expect(macarch.classifyRenderer("Generic Renderer")).toBeNull();
  });
});

describe("macarch.pickHeroUrl", () => {
  const arm64 = "https://example.com/Grida-arm64.dmg";
  const x64 = "https://example.com/Grida-x64.dmg";
  const fallback = "https://example.com/releases/latest";
  const windows = "https://example.com/Grida.Setup.x64.exe";

  it("serves x64 when Mac arch is Intel and the x64 asset exists", () => {
    expect(
      macarch.pickHeroUrl({
        os: "mac",
        defaultUrl: arm64,
        fallbackUrl: fallback,
        macX64Url: x64,
        arch: "x64",
      })
    ).toBe(x64);
  });

  it("keeps arm64 for Apple Silicon", () => {
    expect(
      macarch.pickHeroUrl({
        os: "mac",
        defaultUrl: arm64,
        fallbackUrl: fallback,
        macX64Url: x64,
        arch: "arm64",
      })
    ).toBe(arm64);
  });

  it("keeps arm64 when detection is inconclusive", () => {
    expect(
      macarch.pickHeroUrl({
        os: "mac",
        defaultUrl: arm64,
        fallbackUrl: fallback,
        macX64Url: x64,
        arch: null,
      })
    ).toBe(arm64);
  });

  it("keeps arm64 when Intel is detected but the x64 asset is missing", () => {
    expect(
      macarch.pickHeroUrl({
        os: "mac",
        defaultUrl: arm64,
        fallbackUrl: fallback,
        macX64Url: null,
        arch: "x64",
      })
    ).toBe(arm64);
  });

  it("does not apply Mac arch to Windows or Linux", () => {
    expect(
      macarch.pickHeroUrl({
        os: "windows",
        defaultUrl: windows,
        fallbackUrl: fallback,
        macX64Url: x64,
        arch: "x64",
      })
    ).toBe(windows);
  });

  it("uses the fallback when OS is unknown", () => {
    expect(
      macarch.pickHeroUrl({
        os: null,
        defaultUrl: null,
        fallbackUrl: fallback,
        macX64Url: x64,
        arch: "x64",
      })
    ).toBe(fallback);
  });
});
