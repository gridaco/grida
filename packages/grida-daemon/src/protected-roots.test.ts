// GRIDA-SEC-004 / GRIDA-SEC-014 — credential-root aliases and ancestor grants.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProtectedRoots } from "./protected-roots";

let root: string;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-protected-roots-"))
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("ProtectedRoots", () => {
  it("refuses the exact root, children and ancestors before storage exists", () => {
    const providers = path.join(root, "home", "providers");
    const protectedRoots = new ProtectedRoots([providers]);
    expect(protectedRoots.overlaps(providers)).toBe(true);
    expect(
      protectedRoots.overlaps(path.join(providers, "credentials.toml"))
    ).toBe(true);
    expect(protectedRoots.overlaps(root)).toBe(true);
    expect(protectedRoots.overlaps(providers + "-project")).toBe(false);
  });
  it("resolves existing ancestor aliases for absent descendants", async () => {
    await fs.mkdir(path.join(root, "home"));
    await fs.symlink(path.join(root, "home"), path.join(root, "alias"));
    expect(
      new ProtectedRoots([path.join(root, "home", "providers")]).overlaps(
        path.join(root, "alias", "providers", "credentials.toml")
      )
    ).toBe(true);
  });
  it("rechecks a path that became a symlink after the first grant", async () => {
    await fs.mkdir(path.join(root, "providers"));
    const target = path.join(root, "selected");
    const protectedRoots = new ProtectedRoots([path.join(root, "providers")]);
    expect(protectedRoots.overlaps(target)).toBe(false);
    await fs.symlink(path.join(root, "providers"), target);
    expect(protectedRoots.overlaps(target)).toBe(true);
  });
  it("refuses unresolved symlink authority and relative candidates", async () => {
    await fs.symlink(
      path.join(root, "home", "providers"),
      path.join(root, "alias")
    );
    const protectedRoots = new ProtectedRoots([
      path.join(root, "home", "providers"),
    ]);
    expect(() =>
      protectedRoots.overlaps(path.join(root, "alias", "credentials.toml"))
    ).toThrow("unavailable");
    expect(() =>
      new ProtectedRoots([path.join(root, "alias")]).overlaps(
        path.join(root, "elsewhere")
      )
    ).toThrow("unavailable");
    expect(() => protectedRoots.overlaps("relative")).toThrow("absolute");
  });
  it("fails closed for symlink loops and snapshots supplied roots", async () => {
    const roots = [path.join(root, "providers")];
    const protectedRoots = new ProtectedRoots(roots);
    roots.length = 0;
    expect(protectedRoots.overlaps(root)).toBe(true);
    await fs.symlink(path.join(root, "loop"), path.join(root, "loop"));
    expect(() => protectedRoots.overlaps(path.join(root, "loop"))).toThrow(
      "unavailable"
    );
  });
});
