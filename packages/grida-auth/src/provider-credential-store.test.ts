// GRIDA-SEC-014 — public provider custody contract in disposable private homes.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderCredentialStore } from "./providers";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const home = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "provider-custody-"))
  );
  roots.push(home);
  const directory = path.join(home, "providers");
  const file = path.join(directory, "credentials.toml");
  const store = new ProviderCredentialStore({ home });
  return { home, directory, file, store };
}

async function persisted(
  f: Awaited<ReturnType<typeof fixture>>,
  value: string | Uint8Array
) {
  await fs.mkdir(f.directory, { mode: 0o700 });
  await fs.writeFile(f.file, value, { mode: 0o600 });
}

function source(entries: ProviderCredentialStore.Entry[] = []) {
  return {
    read: vi.fn<() => Promise<ProviderCredentialStore.Entry[]>>(
      async () => entries
    ),
    retire: vi.fn<() => Promise<void>>(async () => {}),
  };
}

describe.skipIf(!["darwin", "linux"].includes(process.platform))(
  "ProviderCredentialStore",
  () => {
    it("constructs without I/O and distinguishes missing credentials from failure", async () => {
      const f = await fixture();
      await expect(fs.stat(f.directory)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await f.store.read("example")).toBeNull();
      expect(await f.store.list()).toEqual([]);
      await expect(fs.stat(f.file)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("shares durable values across independent instances and returns only sorted presence", async () => {
      const f = await fixture();
      await f.store.set("second", "synthetic-secret-b");
      const other = new ProviderCredentialStore({ home: f.home });
      await other.set("first", "synthetic-secret-a");
      expect(await other.read("second")).toBe("synthetic-secret-b");
      expect(await f.store.list()).toEqual([
        { provider: "first" },
        { provider: "second" },
      ]);
      await other.remove("first");
      expect(await f.store.read("first")).toBeNull();
      expect(await f.store.read("second")).toBe("synthetic-secret-b");
      expect(await fs.readFile(f.file, "utf8")).toContain(
        "# Contains secrets."
      );
    });

    it("preserves concurrent per-provider updates across separately constructed stores", async () => {
      const f = await fixture();
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          new ProviderCredentialStore({ home: f.home }).set(
            `provider-${i}`,
            `synthetic-${i}`
          )
        )
      );
      expect(await f.store.list()).toHaveLength(8);
      expect(await f.store.read("provider-3")).toBe("synthetic-3");
    }, 15_000);

    it("creates a private provider directory under an existing readable home without repairs", async () => {
      const f = await fixture();
      await fs.chmod(f.home, 0o755);
      await f.store.set("example", "synthetic");
      expect((await fs.stat(f.home)).mode & 0o7777).toBe(0o755);
      expect((await fs.stat(f.directory)).mode & 0o7777).toBe(0o700);
      expect((await fs.stat(f.file)).mode & 0o7777).toBe(0o600);
      expect(
        (await fs.stat(path.join(f.directory, "profile.lock.sqlite"))).size
      ).toBe(0);
    });

    it.each([
      "../example",
      "Example",
      "",
      "a.b",
      "a/b",
      "a".repeat(65),
      "_hidden",
    ])("rejects invalid provider ID %s before I/O", async (provider) => {
      const f = await fixture();
      await expect(f.store.set(provider, "synthetic")).rejects.toMatchObject({
        code: "invalid_input",
      });
      await expect(f.store.read(provider)).rejects.toMatchObject({
        code: "invalid_input",
      });
      await expect(f.store.remove(provider)).rejects.toMatchObject({
        code: "invalid_input",
      });
      await expect(fs.stat(f.directory)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it.each([
      "",
      "synthetic\nsecret",
      "synthetic\rsecret",
      "synthetic\0secret",
      "synthetic\u007f",
      "synthetic\u0085",
      "\ud800",
      "x".repeat(16_385),
    ])(
      "rejects invalid key without exposing it or touching custody (%#)",
      async (key) => {
        const f = await fixture();
        const error = await f.store
          .set("example", key)
          .catch((value: unknown) => value);
        expect(error).toMatchObject({
          code: "invalid_input",
          message: "Grida provider credentials failed (invalid_input)",
        });
        expect(error).not.toHaveProperty("cause");
        await expect(fs.stat(f.directory)).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    );

    it("preserves valid Unicode, quotes, slashes, and exact key bytes including spaces", async () => {
      const f = await fixture();
      const key = ' synthetic-"-\\-α-🙂 ';
      await f.store.set("constructor", key);
      expect(await f.store.read("constructor")).toBe(key);
      await f.store.set("example", "é".repeat(8192));
      expect(await f.store.read("example")).toHaveLength(8192);
      await expect(
        f.store.set("example", "é".repeat(8193))
      ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it.each(["empty", "escaping", "tombstone"])(
      "accepts independent v1 %s TOML fixture",
      async (name) => {
        const f = await fixture();
        await persisted(
          f,
          await fs.readFile(
            new URL(`../fixtures/providers-v1/${name}.toml`, import.meta.url)
          )
        );
        expect(await f.store.read("example")).toBe(
          name === "escaping" ? 'synthetic-"-\\-α-🙂' : null
        );
      }
    );

    it.each([
      ["unknown-version", "unsupported_version"],
      ["unknown-field", "invalid_store"],
      ["pending", "migration_pending"],
    ])("fails closed on the %s fixture", async (name, code) => {
      const f = await fixture();
      const bytes = await fs.readFile(
        new URL(`../fixtures/providers-v1/${name}.toml`, import.meta.url)
      );
      await persisted(f, bytes);
      await expect(f.store.read("absent")).rejects.toMatchObject({ code });
      await expect(f.store.list()).rejects.toMatchObject({ code });
      await expect(f.store.remove("example")).rejects.toMatchObject({ code });
      await expect(
        f.store.set("example", "synthetic-replacement")
      ).rejects.toMatchObject({ code });
      expect(await fs.readFile(f.file)).toEqual(bytes);
    });

    it.each([
      Buffer.from([0xc3, 0x28]),
      Buffer.from("\uFEFFversion = 1"),
      Buffer.from(
        'version = 1.0\n[migration]\nstate = "complete"\nremoved = []\n[providers]'
      ),
      Buffer.from(
        'version = 1\n[providers.example]\napi_key = "synthetic-secret'
      ),
      Buffer.from(
        'version = 1\n[migration]\nstate = "complete"\nremoved = []\n[providers.example]\napi_key = "synthetic-secret"\napi_key = "duplicate"'
      ),
      Buffer.alloc(1_048_577, 65),
    ])(
      "rejects malformed UTF-8, BOM, TOML and oversized files with body-free failures (%#)",
      async (bytes) => {
        const f = await fixture();
        await persisted(f, bytes);
        const error = await f.store.list().catch((value: unknown) => value);
        expect(error).toMatchObject({
          code: "invalid_store",
          message: "Grida provider credentials failed (invalid_store)",
        });
        expect(error).not.toHaveProperty("cause");
      }
    );

    it("bounds the combined live and removed IDs and leaves the file unchanged on overflow", async () => {
      const f = await fixture();
      const initial = source(
        Array.from({ length: 128 }, (_, i) => ({
          provider: `example-${i}`,
          apiKey: "synthetic",
        }))
      );
      await f.store.migrate(initial);
      const before = await fs.readFile(f.file);
      await expect(f.store.set("overflow", "synthetic")).rejects.toMatchObject({
        code: "invalid_store",
      });
      expect(await fs.readFile(f.file)).toEqual(before);
      expect(await f.store.list()).toHaveLength(128);
    });

    it("imports once with existing canonical keys and pre-import deletions authoritative", async () => {
      const f = await fixture();
      await f.store.set("existing", "synthetic-canonical");
      await f.store.remove("deleted");
      const legacy = source([
        { provider: "existing", apiKey: "synthetic-old" },
        { provider: "deleted", apiKey: "synthetic-stale" },
        { provider: "new", apiKey: "synthetic-import" },
      ]);
      expect(await f.store.migrate(legacy)).toEqual({ state: "complete" });
      expect(legacy.read).toHaveBeenCalledOnce();
      expect(legacy.retire).toHaveBeenCalledOnce();
      expect(await f.store.read("existing")).toBe("synthetic-canonical");
      expect(await f.store.read("deleted")).toBeNull();
      expect(await f.store.read("new")).toBe("synthetic-import");
      await f.store.remove("new");
      const stale = source([
        { provider: "new", apiKey: "synthetic-resurrection" },
      ]);
      await new ProviderCredentialStore({ home: f.home }).migrate(stale);
      expect(stale.read).not.toHaveBeenCalled();
      expect(stale.retire).not.toHaveBeenCalled();
      expect(await f.store.read("new")).toBeNull();
    });

    it("publishes pending before retiring and resumes only retirement after failure", async () => {
      const f = await fixture();
      const legacy = source([
        { provider: "example", apiKey: "synthetic-original" },
      ]);
      legacy.retire.mockImplementation(async () => {
        const pending = await fs.readFile(f.file, "utf8");
        expect(pending).toContain('state = "pending"');
        expect(pending).toContain("synthetic-original");
        throw new Error("synthetic-secret-in-host-exception");
      });
      await expect(f.store.migrate(legacy)).rejects.toMatchObject({
        code: "migration_failed",
        message: "Grida provider credentials failed (migration_failed)",
      });
      await expect(f.store.read("example")).rejects.toMatchObject({
        code: "migration_pending",
      });
      const retry = source([
        { provider: "example", apiKey: "synthetic-changed" },
      ]);
      await new ProviderCredentialStore({ home: f.home }).migrate(retry);
      expect(retry.read).not.toHaveBeenCalled();
      expect(retry.retire).toHaveBeenCalledOnce();
      expect(await f.store.read("example")).toBe("synthetic-original");
    });

    it("never retires or publishes when the source cannot be read or violates bounds", async () => {
      const f = await fixture();
      const legacy = source();
      legacy.read.mockRejectedValue(new Error("synthetic-host-secret"));
      await expect(f.store.migrate(legacy)).rejects.toMatchObject({
        code: "migration_failed",
      });
      expect(legacy.retire).not.toHaveBeenCalled();
      legacy.read.mockResolvedValue([
        { provider: "duplicate", apiKey: "synthetic-one" },
        { provider: "duplicate", apiKey: "synthetic-two" },
      ]);
      await expect(f.store.migrate(legacy)).rejects.toMatchObject({
        code: "invalid_input",
      });
      await expect(fs.stat(f.file)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("does not retire after uncertain publication and resumes without importing again", async () => {
      const f = await fixture();
      await f.store.set("existing", "synthetic-canonical");
      const handle = await fs.open(f.file, "r");
      const prototype = Object.getPrototypeOf(handle) as fs.FileHandle;
      const original = prototype.sync;
      await handle.close();
      vi.spyOn(prototype, "sync").mockImplementation(
        async function (this: fs.FileHandle) {
          if ((await this.stat()).isDirectory())
            throw new Error("synthetic-storage-detail");
          await original.call(this);
        }
      );
      const legacy = source([
        { provider: "imported", apiKey: "synthetic-imported" },
      ]);
      await expect(f.store.migrate(legacy)).rejects.toMatchObject({
        code: "storage_failed",
      });
      expect(legacy.retire).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      const retry = source();
      await f.store.migrate(retry);
      expect(retry.read).not.toHaveBeenCalled();
      expect(await f.store.read("imported")).toBe("synthetic-imported");
    });

    it.each(["symlink", "hardlink", "permissive", "directory"])(
      "refuses unsafe %s credential files without replacement",
      async (kind) => {
        const f = await fixture();
        await f.store.set("example", "synthetic");
        if (kind === "symlink") {
          await fs.rename(f.file, f.file + ".target");
          await fs.symlink(f.file + ".target", f.file);
        } else if (kind === "hardlink")
          await fs.link(f.file, f.file + ".alias");
        else if (kind === "permissive") await fs.chmod(f.file, 0o644);
        else {
          await fs.unlink(f.file);
          await fs.mkdir(f.file, { mode: 0o700 });
        }
        await expect(f.store.read("absent")).rejects.toMatchObject({
          code: "storage_failed",
        });
        await expect(
          f.store.set("example", "synthetic-replacement")
        ).rejects.toMatchObject({ code: "storage_failed" });
      }
    );

    it.each(["symlink", "permissive", "writable-home"])(
      "refuses unsafe %s directory authority without repairs",
      async (kind) => {
        const f = await fixture();
        if (kind === "symlink") await fs.symlink(f.home, f.directory);
        else if (kind === "permissive")
          await fs.mkdir(f.directory, { mode: 0o755 });
        else await fs.chmod(f.home, 0o777);
        await expect(f.store.list()).rejects.toMatchObject({
          code: "storage_failed",
        });
        await expect(fs.stat(f.file)).rejects.toMatchObject({ code: "ENOENT" });
      }
    );

    it("discards unpublished private orphans without adopting secret values", async () => {
      const f = await fixture();
      await f.store.set("example", "synthetic-current");
      const orphan = `${f.file}.${randomUUID()}.tmp`;
      await fs.writeFile(orphan, "synthetic-unpublished", { mode: 0o600 });
      expect(await f.store.read("example")).toBe("synthetic-current");
      await expect(fs.stat(orphan)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it.skipIf(process.platform !== "darwin")(
      "rejects macOS ACL grants even when mode bits remain private",
      async () => {
        const f = await fixture();
        await f.store.set("example", "synthetic");
        await promisify(execFile)("/bin/chmod", [
          "+a",
          "everyone allow read",
          f.file,
        ]);
        await expect(f.store.list()).rejects.toMatchObject({
          code: "storage_failed",
        });
      }
    );

    it("fails closed on unsupported platforms before provider-directory creation", async () => {
      const f = await fixture();
      vi.spyOn(process, "platform", "get").mockReturnValue("win32");
      await expect(f.store.list()).rejects.toMatchObject({
        code: "unsupported_platform",
      });
      await expect(fs.stat(f.directory)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  }
);
