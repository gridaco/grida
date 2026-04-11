import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  discoverPairs,
  filterMatches,
  nameForRelPath,
} from "../src/discover.js";
import { makeSolidPng, writeFixture } from "./fixtures.js";

let root: string;
let actualDir: string;
let expectedDir: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "grida-reftest-discover-"));
  actualDir = path.join(root, "actuals");
  expectedDir = path.join(root, "expecteds");
  fs.mkdirSync(actualDir, { recursive: true });
  fs.mkdirSync(expectedDir, { recursive: true });

  // a/1.png, a/2.png, b/1.png on actual; plus b/2.png and c/3.png on expected
  const img = makeSolidPng(4, 4, [255, 0, 0, 255]);
  writeFixture(path.join(actualDir, "a"), "1.png", img);
  writeFixture(path.join(actualDir, "a"), "2.png", img);
  writeFixture(path.join(actualDir, "b"), "1.png", img);
  writeFixture(path.join(actualDir, "b"), "no-expected.png", img);

  writeFixture(path.join(expectedDir, "a"), "1.png", img);
  writeFixture(path.join(expectedDir, "a"), "2.png", img);
  writeFixture(path.join(expectedDir, "b"), "1.png", img);
  writeFixture(path.join(expectedDir, "b"), "2.png", img); // extra, should be ignored
  writeFixture(path.join(expectedDir, "c"), "3.png", img); // extra, should be ignored
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("nameForRelPath", () => {
  it("strips .png and joins path with _", () => {
    expect(nameForRelPath("foo.png")).toBe("foo");
    expect(nameForRelPath("a/b/c.png")).toBe("a_b_c");
    expect(nameForRelPath("shapes/circle.png")).toBe("shapes_circle");
  });
  it("normalizes backslashes", () => {
    expect(nameForRelPath("a\\b\\c.png")).toBe("a_b_c");
  });
});

describe("filterMatches", () => {
  it("prefix filter with trailing *", () => {
    expect(filterMatches("1_5216", "1_5*")).toBe(true);
    expect(filterMatches("2_5216", "1_5*")).toBe(false);
  });
  it("substring filter without *", () => {
    expect(filterMatches("foo_bar_baz", "bar")).toBe(true);
    expect(filterMatches("foo", "bar")).toBe(false);
  });
});

describe("discoverPairs", () => {
  it("discovers nested pairs and flags missing expected", async () => {
    const pairs = await discoverPairs({ actualDir, expectedDir });
    const names = pairs.map((p) => p.name);
    expect(names).toContain("a_1");
    expect(names).toContain("a_2");
    expect(names).toContain("b_1");
    expect(names).toContain("b_no-expected");
    // Extras on expected side must NOT appear.
    expect(names).not.toContain("b_2");
    expect(names).not.toContain("c_3");

    const missing = pairs.find((p) => p.name === "b_no-expected");
    expect(missing?.expectedExists).toBe(false);
    const present = pairs.find((p) => p.name === "a_1");
    expect(present?.expectedExists).toBe(true);
  });

  it("honors filter", async () => {
    const pairs = await discoverPairs({
      actualDir,
      expectedDir,
      filter: "a_*",
    });
    expect(pairs.map((p) => p.name).sort()).toEqual(["a_1", "a_2"]);
  });

  it("honors substring filter", async () => {
    const pairs = await discoverPairs({
      actualDir,
      expectedDir,
      filter: "no-expected",
    });
    expect(pairs.map((p) => p.name)).toEqual(["b_no-expected"]);
  });

  it("throws if actual-dir missing", async () => {
    await expect(
      discoverPairs({ actualDir: path.join(root, "nope"), expectedDir })
    ).rejects.toThrow(/actual-dir does not exist/);
  });

  it("throws if expected-dir missing", async () => {
    await expect(
      discoverPairs({ actualDir, expectedDir: path.join(root, "nope") })
    ).rejects.toThrow(/expected-dir does not exist/);
  });

  it("respects pattern", async () => {
    // Narrow to just "a/**" pngs.
    const pairs = await discoverPairs({
      actualDir,
      expectedDir,
      pattern: "a/**/*.png",
    });
    expect(pairs.map((p) => p.name).sort()).toEqual(["a_1", "a_2"]);
  });
});
