/**
 * Session scratch — contract tests (WG `docs/wg/ai/agent/scratch.md`).
 *
 * Each test name states the invariant it pins (S1/S2/S4) so a dropped rule is
 * grep-able. Pure derivation is asserted without I/O; the thin I/O helpers run
 * against a real temp dir under `os.tmpdir()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertOutsideSecretsRoot,
  defaultScratchBase,
  ensureScratch,
  listScratchFilePaths,
  prepareScratchAuthority,
  removeScratch,
  scratchRootFor,
  sweepScratch,
  writeScratchFile,
} from "./scratch";
import { containsPath } from "@grida/daemon/server";

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

  it("ensureScratch creates every authority level owner-only (0700)", async () => {
    // Other local accounts must not read produced/extracted artifacts on a
    // shared machine (`<os.tmpdir()>` can resolve under a world-traversable
    // `/tmp`). Skip on Windows, which has no POSIX mode bits.
    if (process.platform === "win32") return;
    const root = scratchRootFor(base, "ses_mode");
    await ensureScratch(root);
    for (const dir of [
      base,
      path.join(base, "sessions"),
      path.dirname(root),
      root,
    ]) {
      expect((await fs.lstat(dir)).mode & 0o777).toBe(0o700);
    }
  });

  it("ensureScratch refuses a scratch dir nested in the secret root (S4)", async () => {
    // A misconfigured base that would put scratch inside `userData` fails loudly
    // before any dir is created.
    const secrets = base;
    const badDir = scratchRootFor(path.join(base, "nested"), "ses_x");
    await expect(ensureScratch(badDir, secrets)).rejects.toThrow(/secret root/);
  });

  it("ensureScratch tightens every pre-existing permissive authority dir to 0700", async () => {
    // `mkdir` won't change an existing dir's mode, so an attacker-pre-created
    // world-readable level would otherwise keep leaking. Skip on Windows.
    if (process.platform === "win32") return;
    const root = scratchRootFor(base, "ses_pre");
    await fs.mkdir(root, { recursive: true });
    // Force a permissive starting mode regardless of the runner's umask (which
    // could otherwise mask mkdir's mode down to 0700 and skip the tightening
    // path this test exists to exercise).
    const dirs = [base, path.join(base, "sessions"), path.dirname(root), root];
    for (const dir of dirs) {
      await fs.chmod(dir, 0o755);
    }
    await ensureScratch(root);
    for (const dir of dirs) {
      expect((await fs.lstat(dir)).mode & 0o777).toBe(0o700);
    }
  });

  it("ensureScratch rejects authority ancestry not owned by the current uid or root", async () => {
    if (process.platform === "win32" || process.getuid === undefined) return;
    const realUid = process.getuid();
    const uid = realUid === Number.MAX_SAFE_INTEGER ? realUid - 1 : realUid + 1;
    const getuid = vi.spyOn(process, "getuid").mockReturnValue(uid);
    try {
      await expect(
        ensureScratch(scratchRootFor(base, "ses_foreign"))
      ).rejects.toThrow(/uid/);
    } finally {
      getuid.mockRestore();
    }
  });

  it("ensureScratch rejects a sticky parent owned by an unprivileged foreign uid", async () => {
    if (
      process.platform === "win32" ||
      process.getuid === undefined ||
      process.getuid() === 0
    ) {
      return;
    }
    const foreignParent = path.join(base, "foreign-sticky-parent");
    await fs.mkdir(foreignParent);
    await fs.chmod(foreignParent, 0o1777);
    const realUid = process.getuid();
    const getuid = vi
      .spyOn(process, "getuid")
      .mockReturnValue(
        realUid === Number.MAX_SAFE_INTEGER ? realUid - 1 : realUid + 1
      );
    try {
      await expect(
        ensureScratch(
          scratchRootFor(path.join(foreignParent, "authority"), "ses_x")
        )
      ).rejects.toThrow(/nor privileged uid 0/);
    } finally {
      getuid.mockRestore();
    }
  });

  it("ensureScratch rejects a group/other-writable non-sticky base parent", async () => {
    if (process.platform === "win32") return;
    const unsafeParent = path.join(base, "unsafe-parent");
    await fs.mkdir(unsafeParent, { mode: 0o777 });
    await fs.chmod(unsafeParent, 0o777);
    const unsafeBase = path.join(unsafeParent, "authority");

    await expect(
      ensureScratch(scratchRootFor(unsafeBase, "ses_x"))
    ).rejects.toThrow(/group\/other-writable without the sticky bit/);
    await expect(fs.lstat(unsafeBase)).rejects.toThrow(/ENOENT/);
  });

  it("ensureScratch accepts a sticky shared base parent", async () => {
    if (process.platform === "win32") return;
    const stickyParent = path.join(base, "sticky-parent");
    await fs.mkdir(stickyParent);
    await fs.chmod(stickyParent, 0o1777);
    const root = scratchRootFor(path.join(stickyParent, "authority"), "ses_x");

    await expect(ensureScratch(root)).resolves.toBeUndefined();
    expect(
      (await fs.lstat(path.dirname(path.dirname(root)))).mode & 0o777
    ).toBe(0o700);
  });

  it("ensureScratch refuses a SYMLINKED base that resolves into the secret root (S4)", async () => {
    // A purely lexical check passes here — `<link>/…` is not textually inside
    // `<secrets>` — but the physical path resolves back into the secret root.
    // Skip on Windows (no POSIX symlinks without elevation).
    if (process.platform === "win32") return;
    const secrets = path.join(base, "secret");
    await fs.mkdir(secrets);
    const link = path.join(base, "link"); // symlink → the secret dir
    await fs.symlink(secrets, link);
    const scratchDir = scratchRootFor(link, "ses_sym");
    await expect(ensureScratch(scratchDir, secrets)).rejects.toThrow(
      /secret root/
    );
    // Nothing was created under the real secret dir.
    expect(await fs.readdir(secrets)).toEqual([]);
  });

  it("writeScratchFile lands bytes in scratch and returns the absolute path (S3)", async () => {
    const root = scratchRootFor(base, "ses_write");
    await ensureScratch(root);
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const out = await writeScratchFile(root, "image-1.png", bytes);
    expect(out).toBe(path.join(root, "image-1.png"));
    expect(new Uint8Array(await fs.readFile(out))).toEqual(bytes);
  });

  it("writeScratchFile preserves generated-artifact overwrite behavior", async () => {
    const root = scratchRootFor(base, "ses_overwrite");
    await ensureScratch(root);
    const target = await writeScratchFile(
      root,
      "image.png",
      new Uint8Array([1, 2, 3])
    );
    await writeScratchFile(root, "image.png", new Uint8Array([4, 5]));
    expect(new Uint8Array(await fs.readFile(target))).toEqual(
      new Uint8Array([4, 5])
    );
  });

  it("writeScratchFile can reject a seed collision without truncating the original", async () => {
    const root = scratchRootFor(base, "ses_no_clobber");
    await ensureScratch(root);
    const original = new Uint8Array([1, 2, 3]);
    const target = await writeScratchFile(root, "input.bin", original);

    await expect(
      writeScratchFile(root, "input.bin", new Uint8Array([9]), {
        overwrite: false,
      })
    ).rejects.toThrow(/EEXIST/);
    expect(new Uint8Array(await fs.readFile(target))).toEqual(original);
  });

  it("writeScratchFile writes the produced file owner-only (0600)", async () => {
    // Shared-machine reasoning, same as the dir mode. Skip on Windows (no POSIX
    // mode bits).
    if (process.platform === "win32") return;
    const root = scratchRootFor(base, "ses_write_mode");
    await ensureScratch(root);
    const out = await writeScratchFile(
      root,
      "a.png",
      new Uint8Array([1, 2, 3])
    );
    expect((await fs.stat(out)).mode & 0o777).toBe(0o600);
  });

  it("writeScratchFile rejects a filename that escapes the scratch dir (S1)", async () => {
    const root = scratchRootFor(base, "ses_escape");
    await ensureScratch(root);
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(writeScratchFile(root, "../evil.png", bytes)).rejects.toThrow(
      /unsafe/
    );
    await expect(writeScratchFile(root, "a/b.png", bytes)).rejects.toThrow(
      /unsafe/
    );
    await expect(writeScratchFile(root, "..", bytes)).rejects.toThrow(/unsafe/);
  });

  it("writeScratchFile refuses to follow a planted symlink at the basename (#920)", async () => {
    // Skip on Windows (no POSIX symlinks / O_NOFOLLOW without elevation).
    if (process.platform === "win32") return;
    const root = scratchRootFor(base, "ses_symlink");
    await ensureScratch(root);
    // A target OUTSIDE the scratch tree the symlink would redirect the write to.
    const outside = path.join(base, "outside.png");
    await fs.symlink(outside, path.join(root, "image.png"));
    await expect(
      writeScratchFile(root, "image.png", new Uint8Array([1, 2, 3]))
    ).rejects.toThrow(/ELOOP/);
    // The escape target was never created — the write did not follow the link.
    await expect(fs.stat(outside)).rejects.toThrow(/ENOENT/);
  });

  it("listScratchFilePaths reports only live direct regular files and fails closed", async () => {
    const root = scratchRootFor(base, "ses_list");
    await ensureScratch(root);
    await fs.writeFile(path.join(root, "live.bin"), "bytes");
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "nested", "hidden.bin"), "bytes");
    if (process.platform !== "win32") {
      await fs.symlink(
        path.join(root, "live.bin"),
        path.join(root, "linked.bin")
      );
    }

    expect(await listScratchFilePaths(root)).toEqual(new Set(["live.bin"]));
    expect(await listScratchFilePaths(path.join(root, "missing"))).toEqual(
      new Set()
    );
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

  it("removeScratch unlinks a session symlink without deleting its target", async () => {
    if (process.platform === "win32") return;
    prepareScratchAuthority(base);
    const target = path.join(base, "outside-session");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "keep.txt"), "keep");
    const link = path.join(base, "sessions", "ses_link");
    await fs.symlink(target, link);

    await removeScratch(base, "ses_link");

    await expect(fs.lstat(link)).rejects.toThrow(/ENOENT/);
    await expect(
      fs.readFile(path.join(target, "keep.txt"), "utf8")
    ).resolves.toBe("keep");
  });

  it("removeScratch rejects a symlinked sessions authority without touching its target", async () => {
    if (process.platform === "win32") return;
    const authority = path.join(base, "remove-authority");
    const target = path.join(base, "remove-target");
    await fs.mkdir(authority);
    await fs.mkdir(path.join(target, "ses_victim"), { recursive: true });
    await fs.writeFile(path.join(target, "ses_victim", "keep.txt"), "keep");
    await fs.symlink(target, path.join(authority, "sessions"));

    await expect(removeScratch(authority, "ses_victim")).rejects.toThrow(
      /non-symlink directory/
    );
    await expect(
      fs.readFile(path.join(target, "ses_victim", "keep.txt"), "utf8")
    ).resolves.toBe("keep");
  });

  it("sweepScratch reclaims every session dir and establishes a fresh authority (S2)", async () => {
    await ensureScratch(scratchRootFor(base, "ses_a"));
    await ensureScratch(scratchRootFor(base, "ses_b"));
    // Synchronous — the host calls it before serving runs (no race).
    sweepScratch(base);
    expect(await fs.readdir(path.join(base, "sessions"))).toEqual([]);
    // A fresh authority is securely established even when there is nothing to
    // reclaim, ready for the first turn.
    const fresh = path.join(base, "does-not-exist");
    expect(() => sweepScratch(fresh)).not.toThrow();
    expect(await fs.readdir(path.join(fresh, "sessions"))).toEqual([]);
  });

  it("sweepScratch rejects a symlinked base without deleting target contents", async () => {
    if (process.platform === "win32") return;
    const target = path.join(base, "base-target");
    await fs.mkdir(path.join(target, "sessions", "ses_victim"), {
      recursive: true,
    });
    const keep = path.join(target, "sessions", "ses_victim", "keep.txt");
    await fs.writeFile(keep, "keep");
    const link = path.join(base, "base-link");
    await fs.symlink(target, link);

    expect(() => sweepScratch(link)).toThrow(/non-symlink directory/);
    await expect(fs.readFile(keep, "utf8")).resolves.toBe("keep");
  });

  it("sweepScratch rejects physical secret-root overlap before touching a symlink target", async () => {
    if (process.platform === "win32") return;
    const secrets = path.join(base, "secret-root");
    const target = path.join(secrets, "scratch-authority");
    await fs.mkdir(path.join(target, "sessions", "ses_victim"), {
      recursive: true,
    });
    const keep = path.join(target, "sessions", "ses_victim", "keep.txt");
    await fs.writeFile(keep, "keep");
    const link = path.join(base, "secret-link");
    await fs.symlink(target, link);

    expect(() => sweepScratch(link, secrets)).toThrow(
      /physically overlaps the secret root/
    );
    await expect(fs.readFile(keep, "utf8")).resolves.toBe("keep");
  });

  it("sweepScratch rejects a broad base containing the secret root before chmod or deletion", async () => {
    if (process.platform === "win32") return;
    const broadBase = path.join(base, "broad-base");
    const secrets = path.join(broadBase, "user-data");
    const victim = path.join(broadBase, "sessions", "ses_victim");
    await fs.mkdir(secrets, { recursive: true });
    await fs.mkdir(victim, { recursive: true });
    const keep = path.join(victim, "keep.txt");
    await fs.writeFile(keep, "keep");
    await fs.chmod(broadBase, 0o755);

    expect(() => sweepScratch(broadBase, secrets)).toThrow(
      /must not contain the secret root/
    );
    expect((await fs.lstat(broadBase)).mode & 0o777).toBe(0o755);
    await expect(fs.readFile(keep, "utf8")).resolves.toBe("keep");
  });

  it("sweepScratch rejects a symlinked sessions root without deleting target contents", async () => {
    if (process.platform === "win32") return;
    const authority = path.join(base, "sweep-authority");
    const target = path.join(base, "sessions-target");
    await fs.mkdir(authority);
    await fs.mkdir(path.join(target, "ses_victim"), { recursive: true });
    const keep = path.join(target, "ses_victim", "keep.txt");
    await fs.writeFile(keep, "keep");
    await fs.symlink(target, path.join(authority, "sessions"));

    expect(() => sweepScratch(authority)).toThrow(/non-symlink directory/);
    await expect(fs.readFile(keep, "utf8")).resolves.toBe("keep");
  });

  it("sweepScratch unlinks child symlinks instead of recursing into them", async () => {
    if (process.platform === "win32") return;
    prepareScratchAuthority(base);
    const target = path.join(base, "sweep-child-target");
    await fs.mkdir(target);
    const keep = path.join(target, "keep.txt");
    await fs.writeFile(keep, "keep");
    const link = path.join(base, "sessions", "ses_link");
    await fs.symlink(target, link);

    sweepScratch(base);

    await expect(fs.lstat(link)).rejects.toThrow(/ENOENT/);
    await expect(fs.readFile(keep, "utf8")).resolves.toBe("keep");
  });

  it("prepareScratchAuthority secures base and sessions without sweeping", async () => {
    if (process.platform === "win32") return;
    const authority = path.join(base, "prepare-only");
    prepareScratchAuthority(authority);
    const marker = path.join(authority, "sessions", "keep.txt");
    await fs.writeFile(marker, "keep");

    prepareScratchAuthority(authority);

    await expect(fs.readFile(marker, "utf8")).resolves.toBe("keep");
    expect((await fs.lstat(authority)).mode & 0o777).toBe(0o700);
    expect(
      (await fs.lstat(path.join(authority, "sessions"))).mode & 0o777
    ).toBe(0o700);
  });

  it("prepareScratchAuthority never recursively creates a missing parent", async () => {
    const missingParent = path.join(base, "missing-parent");
    expect(() =>
      prepareScratchAuthority(path.join(missingParent, "authority"))
    ).toThrow(/cannot inspect parent/);
    await expect(fs.lstat(missingParent)).rejects.toThrow(/ENOENT/);
  });
});

describe("defaultScratchBase", () => {
  it("is under the OS temp area (host-owned location, outside any secret root)", () => {
    const b = defaultScratchBase("/home/u/.grida/agent");
    // Real containment, not a string prefix — a sibling like `${tmpdir}-evil`
    // must NOT satisfy this (uses the same primitive as the runtime gates).
    expect(containsPath(os.tmpdir(), b)).toBe(true);
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

  it("lets a native host inject its own temp authority root", () => {
    const nativeTemp = path.join(os.tmpdir(), "desktop-owned-temp");
    const b = defaultScratchBase("/home/u/.grida/agent", nativeTemp);
    expect(path.dirname(b)).toBe(nativeTemp);
    expect(path.basename(b)).toMatch(/^grida-agent-[0-9a-f]{16}$/);
  });
});
