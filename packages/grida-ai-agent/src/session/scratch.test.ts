/**
 * Session scratch — contract tests (WG `docs/wg/ai/agent/scratch.md`).
 *
 * Each test name states the invariant it pins (S1/S2/S4) so a dropped rule is
 * grep-able. Pure derivation is asserted without I/O; the thin I/O helpers run
 * against a real temp dir under `os.tmpdir()`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertOutsideSecretsRoot,
  defaultScratchBase,
  ensureScratch,
  removeScratch,
  scratchRootFor,
  sweepScratch,
} from "./scratch";

describe("scratchRootFor (pure derivation)", () => {
  it("isolates per session under base (S1)", () => {
    const base = "/data/grida-agent";
    const a = scratchRootFor(base, "ses_AAA");
    const b = scratchRootFor(base, "ses_BBB");
    expect(a).toBe(path.join(base, "sessions", "ses_AAA", "scratch"));
    expect(b).toBe(path.join(base, "sessions", "ses_BBB", "scratch"));
    // Neither session's scratch is a prefix of the other's — structural
    // isolation, not a convention.
    expect(a.startsWith(b)).toBe(false);
    expect(b.startsWith(a)).toBe(false);
  });

  it("rejects a session id with a path separator (S1 isolation can't be subverted)", () => {
    expect(() => scratchRootFor("/data", "../escape")).toThrow(/unsafe/);
    expect(() => scratchRootFor("/data", "a/b")).toThrow(/unsafe/);
    expect(() => scratchRootFor("/data", "..")).toThrow(/unsafe/);
  });
});

describe("assertOutsideSecretsRoot (S4 containment, pure)", () => {
  it("throws when scratch sits inside the secret root", () => {
    const secrets = "/home/u/.grida/agent";
    expect(() =>
      assertOutsideSecretsRoot(path.join(secrets, "scratch"), secrets)
    ).toThrow(/secret root/);
  });

  it("allows a scratch sibling of the secret root", () => {
    const secrets = "/home/u/.grida/agent";
    expect(() =>
      assertOutsideSecretsRoot("/tmp/grida-agent/sessions/x/scratch", secrets)
    ).not.toThrow();
    // A sibling whose path merely shares a prefix string is NOT inside.
    expect(() =>
      assertOutsideSecretsRoot("/home/u/.grida/agent-x/scratch", secrets)
    ).not.toThrow();
  });

  it("is a no-op when no secret root is given", () => {
    expect(() =>
      assertOutsideSecretsRoot("/anything/scratch", undefined)
    ).not.toThrow();
  });
});

describe("scratch I/O helpers", () => {
  let base: string;
  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "grida-scratch-test-"));
  });
  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it("ensureScratch creates the dir lazily and is idempotent (S1)", async () => {
    const root = scratchRootFor(base, "ses_one");
    await ensureScratch(root);
    const stat = await fs.stat(root);
    expect(stat.isDirectory()).toBe(true);
    // Second call is a no-op, not an error.
    await expect(ensureScratch(root)).resolves.toBeUndefined();
  });

  it("ensureScratch creates the scratch dir owner-only (0700)", async () => {
    // Other local accounts must not read produced/extracted artifacts on a
    // shared machine (`<os.tmpdir()>` can resolve under a world-traversable
    // `/tmp`). Skip on Windows, which has no POSIX mode bits.
    if (process.platform === "win32") return;
    const root = scratchRootFor(base, "ses_mode");
    await ensureScratch(root);
    const stat = await fs.stat(root);
    expect(stat.mode & 0o777).toBe(0o700);
  });

  it("ensureScratch refuses a scratch dir nested in the secret root (S4)", async () => {
    // A misconfigured base that would put scratch inside `userData` fails loudly
    // before any dir is created.
    const secrets = base;
    const badDir = scratchRootFor(path.join(base, "nested"), "ses_x");
    await expect(ensureScratch(badDir, secrets)).rejects.toThrow(/secret root/);
  });

  it("removeScratch is recursive and idempotent (S2)", async () => {
    const root = scratchRootFor(base, "ses_rm");
    await ensureScratch(root);
    await fs.writeFile(path.join(root, "artifact.txt"), "produced");
    await fs.mkdir(path.join(root, "extracted"), { recursive: true });
    await removeScratch(base, "ses_rm");
    await expect(fs.stat(path.dirname(root))).rejects.toThrow(/ENOENT/);
    // Removing a session that never allocated scratch is a no-op.
    await expect(removeScratch(base, "ses_never")).resolves.toBeUndefined();
  });

  it("sweepScratch reclaims every session dir; a missing base is a no-op (S2)", async () => {
    await ensureScratch(scratchRootFor(base, "ses_a"));
    await ensureScratch(scratchRootFor(base, "ses_b"));
    // Synchronous — the host calls it before serving runs (no race).
    sweepScratch(base);
    expect(await fs.readdir(path.join(base, "sessions"))).toEqual([]);
    // A base that was never used (fresh host) sweeps without error.
    expect(() => sweepScratch(path.join(base, "does-not-exist"))).not.toThrow();
  });
});

describe("defaultScratchBase", () => {
  it("is under the OS temp area (host-owned location, outside any secret root)", () => {
    const b = defaultScratchBase("/home/u/.grida/agent");
    expect(b.startsWith(os.tmpdir())).toBe(true);
    expect(path.basename(b)).toMatch(/^grida-agent-[0-9a-f]{16}$/);
  });

  it("namespaces per host so two hosts don't share a base (sweep isolation)", () => {
    // Different userData → different base → one host's start sweep can't wipe
    // the other's live session scratch. Same userData → stable across restarts.
    const a = defaultScratchBase("/home/u/.grida/agent");
    const b = defaultScratchBase("/home/u/.grida/cli");
    expect(a).not.toBe(b);
    expect(defaultScratchBase("/home/u/.grida/agent")).toBe(a);
  });
});
