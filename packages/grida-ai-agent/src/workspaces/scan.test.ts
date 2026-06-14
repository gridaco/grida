/**
 * Workspace hydrate-scan policy (issue #786). The ignore set is what stops the
 * agent from slurping `node_modules` / `.git` / build output on every run; the
 * caps are the backstop for a tree that is genuinely huge regardless.
 */
import { describe, expect, it } from "vitest";
import {
  isIgnoredScanDir,
  isIgnoredScanFile,
  SCAN_MAX_DEPTH,
  SCAN_MAX_FILES,
} from "./scan";

describe("isIgnoredScanDir", () => {
  it("skips the heavy/generated dirs that cause the blow-up", () => {
    for (const name of [
      ".git",
      "node_modules",
      "dist",
      "build",
      ".next",
      ".turbo",
      "target",
      ".venv",
      "__pycache__",
      ".cache",
      "coverage",
    ]) {
      expect(isIgnoredScanDir(name)).toBe(true);
    }
  });

  it("does not skip ordinary source dirs", () => {
    for (const name of ["src", "lib", "app", "components", "tests", "docs"]) {
      expect(isIgnoredScanDir(name)).toBe(false);
    }
  });

  it("matches by exact basename only (no prefix/substring match)", () => {
    // A real source dir that merely contains an ignored name as a substring
    // must NOT be skipped.
    expect(isIgnoredScanDir("node_modules_backup")).toBe(false);
    expect(isIgnoredScanDir("my-dist")).toBe(false);
    expect(isIgnoredScanDir("targeting")).toBe(false);
  });
});

describe("isIgnoredScanFile", () => {
  it("skips known-binary content that can't hydrate as text", () => {
    for (const name of [
      "logo.png",
      "photo.JPG", // case-insensitive on the extension
      "icon.webp",
      "font.woff2",
      "clip.mp4",
      "bundle.wasm",
      "lib.so",
      "report.pdf",
      "weights.safetensors",
      "data.parquet",
      "archive.tar.gz", // final extension only
    ]) {
      expect(isIgnoredScanFile(name)).toBe(true);
    }
  });

  it("keeps source/text files — including svg (XML the agent edits)", () => {
    for (const name of [
      "index.ts",
      "App.tsx",
      "README.md",
      "data.json",
      "styles.css",
      "chart.svg",
      "notes.txt",
      "script.py",
      "Cargo.toml",
    ]) {
      expect(isIgnoredScanFile(name)).toBe(false);
    }
  });

  it("keeps extension-less files and dotfiles", () => {
    expect(isIgnoredScanFile("Makefile")).toBe(false);
    expect(isIgnoredScanFile("LICENSE")).toBe(false);
    expect(isIgnoredScanFile(".gitignore")).toBe(false);
    expect(isIgnoredScanFile(".env")).toBe(false);
  });
});

describe("scan caps", () => {
  it("exposes sane positive bounds", () => {
    expect(SCAN_MAX_FILES).toBeGreaterThan(0);
    expect(SCAN_MAX_DEPTH).toBeGreaterThan(0);
  });
});
