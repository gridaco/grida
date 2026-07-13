/**
 * GRIDA-SEC-004 — directory-reference authority pins.
 *
 * Descriptors expose a virtual read-only mount, never a host root. Pending
 * grants are bounded/expiring, claim is all-or-nothing and session-exclusive,
 * sensitive roots remain denied even without an OS sandbox, and a fork-like
 * second session inherits no authority.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DirectoryScopeError,
  DirectoryScopeRegistry,
} from "./directory-scopes";

describe("DirectoryScopeRegistry", () => {
  let root: string;
  let userData: string;
  let picked: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-dir-scope-"));
    userData = path.join(root, "user-data");
    picked = path.join(root, "references");
    await fs.mkdir(userData);
    await fs.mkdir(picked);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("mints an opaque descriptor and keeps the canonical root server-side", async () => {
    const registry = new DirectoryScopeRegistry({ secrets_root: userData });
    const descriptor = await registry.attach(picked);

    expect(descriptor).toEqual({
      kind: "scope",
      id: expect.stringMatching(/^dir_[0-9a-f-]+$/),
      name: "references",
      path: `/__references__/${descriptor.id}`,
      access: "read",
    });
    expect(descriptor).not.toHaveProperty("root");

    const [grant] = registry.claim("ses_a", [descriptor]);
    expect(grant.root).toBe(await fs.realpath(picked));
    expect(registry.forSession("ses_a")).toEqual([grant]);
  });

  it.skipIf(process.platform === "win32")(
    "records the exact realpath target without expanding to a parent",
    async () => {
      const target = path.join(root, "actual");
      const link = path.join(root, "picked-link");
      await fs.mkdir(target);
      await fs.symlink(target, link);
      const registry = new DirectoryScopeRegistry({ secrets_root: userData });

      const descriptor = await registry.attach(link);
      const [grant] = registry.claim("ses_a", [descriptor]);
      expect(grant.root).toBe(await fs.realpath(target));
      expect(grant.root).not.toBe(root);
    }
  );

  it("rejects files and missing paths", async () => {
    const file = path.join(root, "note.txt");
    await fs.writeFile(file, "x");
    const registry = new DirectoryScopeRegistry({ secrets_root: userData });

    await expect(registry.attach(file)).rejects.toMatchObject({
      code: "directory-scope-not-directory",
    });
    await expect(
      registry.attach(path.join(root, "missing"))
    ).rejects.toMatchObject({ code: "directory-scope-invalid-path" });
  });

  it("rejects a protected root, its descendant, and any ancestor containing it", async () => {
    const homeSecret = path.join(root, "home", ".ssh");
    await fs.mkdir(homeSecret, { recursive: true });
    const registry = new DirectoryScopeRegistry({
      secrets_root: userData,
      protected_roots: [homeSecret],
    });

    for (const unsafe of [
      userData,
      path.join(userData, "sessions"),
      path.dirname(userData),
      homeSecret,
      path.dirname(homeSecret),
      root,
    ]) {
      await fs.mkdir(unsafe, { recursive: true });
      await expect(registry.attach(unsafe)).rejects.toMatchObject({
        code: "directory-scope-protected-root",
      });
    }
  });

  it.skipIf(process.platform === "win32")(
    "re-resolves protected roots for every attachment gesture",
    async () => {
      const safe = path.join(root, "safe");
      const protectedLink = path.join(root, "protected-link");
      await fs.mkdir(safe);
      const registry = new DirectoryScopeRegistry({
        secrets_root: userData,
        protected_roots: [protectedLink],
      });

      // The missing protected path initially falls back to its lexical path.
      await registry.attach(safe);
      // Its filesystem identity can change during the registry's lifetime.
      await fs.symlink(picked, protectedLink);
      await expect(registry.attach(picked)).rejects.toMatchObject({
        code: "directory-scope-protected-root",
      });
    }
  );

  it("bounds pending grants and releases expired capacity", async () => {
    let now = 1_000;
    const registry = new DirectoryScopeRegistry({
      secrets_root: userData,
      pending_ttl_ms: 100,
      max_pending: 1,
      now: () => now,
    });
    await registry.attach(picked);
    await expect(registry.attach(picked)).rejects.toMatchObject({
      code: "directory-scope-pending-limit",
    });

    now += 101;
    await expect(registry.attach(picked)).resolves.toMatchObject({
      kind: "scope",
    });
  });

  it("reserves pending capacity across concurrent validation and releases failures", async () => {
    const registry = new DirectoryScopeRegistry({
      secrets_root: userData,
      max_pending: 1,
    });

    const first = registry.attach(picked);
    await expect(registry.attach(picked)).rejects.toMatchObject({
      code: "directory-scope-pending-limit",
    });
    registry.claim("ses_a", [await first]);

    const invalid = registry.attach(path.join(root, "missing"));
    const blocked = registry.attach(picked);
    await Promise.all([
      expect(invalid).rejects.toMatchObject({
        code: "directory-scope-invalid-path",
      }),
      expect(blocked).rejects.toMatchObject({
        code: "directory-scope-pending-limit",
      }),
    ]);
    await expect(registry.attach(picked)).resolves.toMatchObject({
      kind: "scope",
    });
  });

  it("claims atomically, idempotently, and exclusively to one session", async () => {
    const other = path.join(root, "other");
    await fs.mkdir(other);
    const registry = new DirectoryScopeRegistry({ secrets_root: userData });
    const a = await registry.attach(picked);
    const b = await registry.attach(other);

    expect(() =>
      registry.claim("ses_a", [
        a,
        {
          kind: "scope",
          id: "dir_missing",
          name: "missing",
          path: "/__references__/dir_missing",
          access: "read",
        },
      ])
    ).toThrow(DirectoryScopeError);
    // The failed set consumed nothing: both real candidates remain claimable.
    const grants = registry.claim("ses_a", [a, b]);
    expect(grants.map((g) => g.id)).toEqual([a.id, b.id]);
    expect(registry.claim("ses_a", [a])).toEqual([grants[0]]);
    expect(() => registry.claim("ses_b", [a])).toThrowError(
      expect.objectContaining({
        code: "directory-scope-owned-by-another-session",
      })
    );
    // A fork-like session owns no scopes merely because transcript parts copy.
    expect(registry.forSession("ses_b")).toEqual([]);
  });

  it("rejects a relabeled descriptor without consuming its valid grant", async () => {
    const registry = new DirectoryScopeRegistry({ secrets_root: userData });
    const descriptor = await registry.attach(picked);
    expect(() =>
      registry.claim("ses_a", [{ ...descriptor, name: "misleading" }])
    ).toThrowError(
      expect.objectContaining({ code: "directory-scope-descriptor-mismatch" })
    );
    // Canonical facts still claim successfully after the rejected mutation.
    expect(registry.claim("ses_a", [descriptor])).toHaveLength(1);
  });

  it("revokes a deleted session and clears all authority on dispose", async () => {
    const registry = new DirectoryScopeRegistry({ secrets_root: userData });
    const first = await registry.attach(picked);
    registry.claim("ses_a", [first]);
    registry.forgetSession("ses_a");
    expect(registry.forSession("ses_a")).toEqual([]);
    expect(() => registry.claim("ses_a", [first])).toThrowError(
      expect.objectContaining({ code: "directory-scope-unavailable" })
    );

    const second = await registry.attach(picked);
    registry.claim("ses_b", [second]);
    registry.dispose();
    expect(registry.forSession("ses_b")).toEqual([]);
    expect(() => registry.claim("ses_b", [second])).toThrowError(
      expect.objectContaining({ code: "directory-scope-unavailable" })
    );
  });
});
