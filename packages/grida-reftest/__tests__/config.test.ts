import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadSuiteConfig, parseSuiteConfig } from "../src/config.js";

let tmp: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grida-reftest-config-"));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("parseSuiteConfig (TOML)", () => {
  it("parses nested [test] form", () => {
    const raw = `
[test]
name = "refig-standard"
inputs = "renders/**/*.png"
expects = "exports"
bg = "white"

[test.diff]
aa = true
threshold = 0.1

[test.scoring]
mask = "alpha"
`;
    const cfg = parseSuiteConfig(raw, "toml");
    expect(cfg.name).toBe("refig-standard");
    expect(cfg.inputs).toBe("renders/**/*.png");
    expect(cfg.expects).toBe("exports");
    expect(cfg.bg).toBe("white");
    expect(cfg.diff?.aa).toBe(true);
    expect(cfg.diff?.threshold).toBe(0.1);
    expect(cfg.scoring?.mask).toBe("alpha");
  });

  it("parses legacy top-level form", () => {
    const raw = `
name = "legacy"
inputs = "svg"
expects = "png"
bg = "black"

[diff]
threshold = 0.05
`;
    const cfg = parseSuiteConfig(raw, "toml");
    expect(cfg.name).toBe("legacy");
    expect(cfg.inputs).toBe("svg");
    expect(cfg.expects).toBe("png");
    expect(cfg.bg).toBe("black");
    expect(cfg.diff?.threshold).toBe(0.05);
  });

  it("rejects unknown bg value", () => {
    expect(() => parseSuiteConfig(`[test]\nbg="pink"\n`, "toml")).toThrow(
      /invalid bg/
    );
  });

  it("rejects unknown scoring.mask", () => {
    expect(() =>
      parseSuiteConfig(`[test.scoring]\nmask="fancy"\n`, "toml")
    ).toThrow(/invalid scoring.mask/);
  });
});

describe("parseSuiteConfig (JSON)", () => {
  it("parses JSON equivalent", () => {
    const raw = JSON.stringify({
      test: {
        name: "refig-standard",
        inputs: "renders/**/*.png",
        expects: "exports",
        bg: "white",
        diff: { aa: true, threshold: 0.1 },
        scoring: { mask: "alpha" },
      },
    });
    const cfg = parseSuiteConfig(raw, "json");
    expect(cfg.name).toBe("refig-standard");
    expect(cfg.diff?.aa).toBe(true);
    expect(cfg.scoring?.mask).toBe("alpha");
  });
});

describe("loadSuiteConfig", () => {
  it("returns null when no config file exists", () => {
    expect(loadSuiteConfig(tmp)).toBeNull();
  });

  it("reads reftest.toml from a directory", () => {
    const dir = fs.mkdtempSync(path.join(tmp, "suite-"));
    fs.writeFileSync(path.join(dir, "reftest.toml"), `[test]\nname = "abc"\n`);
    const cfg = loadSuiteConfig(dir);
    expect(cfg?.name).toBe("abc");
  });

  it("reads reftest.json when toml is absent", () => {
    const dir = fs.mkdtempSync(path.join(tmp, "suite-"));
    fs.writeFileSync(
      path.join(dir, "reftest.json"),
      JSON.stringify({ test: { name: "from-json" } })
    );
    const cfg = loadSuiteConfig(dir);
    expect(cfg?.name).toBe("from-json");
  });
});
