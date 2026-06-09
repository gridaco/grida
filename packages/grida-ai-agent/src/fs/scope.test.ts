/**
 * GRIDA-SEC-004 — protected (no-clobber) path policy (`fs/scope.ts`).
 *
 * Pins the fs-tool half of the filesystem model: VCS state, rc/env files,
 * package-manager config + lockfiles, and agent config are off-limits to the
 * edit tools (the shell half is the OS sandbox's mandatory-deny set). Matched
 * by path segment / basename so a protected dir/file anywhere in the tree is
 * covered; ordinary source paths pass.
 */
import { describe, expect, it } from "vitest";
import { isProtectedWrite } from "./scope";

describe("isProtectedWrite", () => {
  it("protects VCS state anywhere in the tree", () => {
    expect(isProtectedWrite("/.git/config")).toBe(true);
    expect(isProtectedWrite("/pkg/.git/hooks/pre-commit")).toBe(true);
    expect(isProtectedWrite("/.hg/store")).toBe(true);
  });

  it("protects rc/env, package-manager config, and lockfiles by basename", () => {
    for (const p of [
      "/.zshrc",
      "/.envrc",
      "/.npmrc",
      "/sub/.npmrc",
      "/package-lock.json",
      "/pnpm-lock.yaml",
      "/yarn.lock",
      "/.mcp.json",
    ]) {
      expect(isProtectedWrite(p)).toBe(true);
    }
  });

  it("allows ordinary source and config files", () => {
    for (const p of [
      "/src/index.ts",
      "/package.json",
      "/README.md",
      "/chart.svg",
      "/sub/gitignore-ish.txt",
    ]) {
      expect(isProtectedWrite(p)).toBe(false);
    }
  });

  it("handles workspace-relative paths and empty input", () => {
    expect(isProtectedWrite(".git/config")).toBe(true);
    expect(isProtectedWrite("src/app.ts")).toBe(false);
    expect(isProtectedWrite("")).toBe(false);
  });
});
