// GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — fixed host-local Windows custody.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore, type OAuthEntry } from "./auth/file";
import { SecretsStore } from "./secrets";

// Exercises the Windows-selected branch with real disposable files. These
// assertions are not a claim of Windows ACL or shared-store support.
describe.skipIf(!["darwin", "linux"].includes(process.platform))(
  "Windows host-local provider compatibility",
  () => {
    let root: string;
    let state: string;
    let providerHome: string;
    let filename: string;
    let auth: AuthStore;
    let secrets: SecretsStore;
    const oauth: OAuthEntry = {
      type: "oauth",
      access: "synthetic-access",
      refresh: "synthetic-refresh",
      expires: 123456,
      account_id: "synthetic-account",
    };

    beforeEach(async () => {
      root = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), "grida-windows-custody-"))
      );
      state = path.join(root, "agent");
      providerHome = path.join(root, "shared-home");
      filename = path.join(state, "auth.json");
      await fs.mkdir(state, { mode: 0o700 });
      vi.spyOn(process, "platform", "get").mockReturnValue("win32");
      auth = new AuthStore(state);
      secrets = new SecretsStore(auth, providerHome);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await fs.rm(root, { recursive: true, force: true });
    });

    async function write(value: unknown) {
      await fs.writeFile(filename, JSON.stringify(value), { mode: 0o600 });
    }

    it("treats an absent native file as keyless without opening shared custody", async () => {
      expect(await secrets.has("fal")).toBe(false);
      expect(await secrets._getKey("openrouter")).toBeNull();
      expect(await secrets._getKey("constructor")).toBeNull();
      expect(secrets.directory).toBe(state);
      expect(await fs.readdir(state)).toEqual([]);
      await expect(fs.stat(providerHome)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("preserves existing API keys and OAuth through key updates, refresh and restart", async () => {
      await write({
        fal: { type: "api", key: "synthetic-old-fal" },
        chatgpt: oauth,
      });
      expect(await secrets._getKey("fal")).toBe("synthetic-old-fal");
      const refreshed = { ...oauth, access: "synthetic-refreshed-access" };
      await Promise.all([
        secrets.set("openrouter", "synthetic-openrouter"),
        auth.replaceIfUnchanged("chatgpt", oauth, refreshed),
        secrets.delete("fal"),
      ]);
      const restarted = new SecretsStore(new AuthStore(state), providerHome);
      expect(await restarted._getKey("openrouter")).toBe(
        "synthetic-openrouter"
      );
      expect(await restarted.has("fal")).toBe(false);
      expect(await auth.get("chatgpt")).toEqual(refreshed);
      expect(JSON.parse(await fs.readFile(filename, "utf8"))).toEqual({
        chatgpt: refreshed,
        openrouter: { type: "api", key: "synthetic-openrouter" },
      });
      expect(await fs.readdir(state)).toEqual(["auth.json"]);
      await expect(fs.stat(providerHome)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("selects the backend once and never imports or changes the shared file", async () => {
      const shared = path.join(providerHome, "providers");
      await fs.mkdir(shared, { recursive: true, mode: 0o700 });
      const untouched = path.join(shared, "credentials.toml");
      await fs.writeFile(untouched, "synthetic malformed shared TOML", {
        mode: 0o600,
      });
      vi.restoreAllMocks();
      await secrets.set("fal", "synthetic-local-fal");
      expect(await secrets._getKey("fal")).toBe("synthetic-local-fal");
      expect(await fs.readFile(untouched, "utf8")).toBe(
        "synthetic malformed shared TOML"
      );
      expect(await fs.readdir(shared)).toEqual(["credentials.toml"]);
      expect(await fs.readdir(state)).toEqual(["auth.json"]);
    });

    it("never reads provider keys from the former test environment override", async () => {
      await write({ fal: { type: "api", key: "synthetic-disk-key" } });
      vi.stubEnv(
        "GRIDA_AUTH_CONTENT",
        JSON.stringify({ fal: { type: "api", key: "synthetic-env-key" } })
      );
      expect(await secrets._getKey("fal")).toBe("synthetic-disk-key");
    });

    it("keeps native OAuth entries separate from provider-key mutation", async () => {
      await write({ chatgpt: oauth });
      expect(await secrets._getKey("chatgpt")).toBeNull();
      await secrets.delete("chatgpt");
      await expect(
        secrets.set("chatgpt", "synthetic-api-key")
      ).rejects.toMatchObject({
        code: "storage_failed",
      });
      expect(await auth.get("chatgpt")).toEqual(oauth);
    });

    it("does not interpret Windows stat permission bits as a POSIX ACL", async () => {
      await write({
        fal: { type: "api", key: "synthetic-key" },
        chatgpt: oauth,
      });
      // Windows commonly reports 0666 even after a mode=0600 write. Only this
      // private disposable fixture has widened POSIX bits; its parent is 0700.
      await fs.chmod(filename, 0o666);
      expect(await secrets._getKey("fal")).toBe("synthetic-key");
      expect(await auth.get("chatgpt")).toEqual(oauth);
      const refreshed = { ...oauth, access: "synthetic-next" };
      expect(await auth.replaceIfUnchanged("chatgpt", oauth, refreshed)).toBe(
        true
      );
      expect(await secrets._getKey("fal")).toBe("synthetic-key");
      expect(await auth.get("chatgpt")).toEqual(refreshed);
    });

    it.each([
      "malformed",
      "empty",
      "blank-key",
      "invalid-key",
      "invalid-record",
      "unicode",
      "utf8",
      "oversized",
    ])(
      "refuses %s custody on reads and mutations without replacing it",
      async (kind) => {
        const contents =
          kind === "utf8"
            ? Buffer.from([0xff])
            : Buffer.from(
                {
                  malformed: "synthetic secret-bearing malformed JSON",
                  empty: "",
                  "blank-key": JSON.stringify({
                    fal: { type: "api", key: " \t " },
                  }),
                  "invalid-key": JSON.stringify({
                    fal: { type: "api", key: 12 },
                  }),
                  "invalid-record": JSON.stringify({ fal: null }),
                  unicode: JSON.stringify({
                    fal: { type: "api", key: "\ud800" },
                  }),
                  oversized: " ".repeat(1_048_577),
                }[kind]!
              );
        await fs.writeFile(filename, contents, { mode: 0o600 });
        for (const operation of [
          () => secrets.has("fal"),
          () => secrets.set("fal", "synthetic-replacement"),
          () => secrets.delete("fal"),
        ]) {
          await expect(operation()).rejects.toMatchObject({
            code: "storage_failed",
            message: "Grida provider credentials failed (storage_failed)",
          });
          expect((await fs.readFile(filename)).equals(contents)).toBe(true);
        }
      }
    );

    it.each(["symlink", "hardlink"])(
      "refuses unsafe legacy %s rather than using another backend",
      async (kind) => {
        await write({ fal: { type: "api", key: "synthetic-key" } });
        if (kind === "hardlink")
          await fs.link(filename, path.join(state, "other.json"));
        if (kind === "symlink") {
          await fs.rename(filename, path.join(state, "other.json"));
          await fs.symlink(path.join(state, "other.json"), filename);
        }
        await expect(secrets.has("fal")).rejects.toMatchObject({
          code: "storage_failed",
        });
        await expect(
          secrets.set("fal", "synthetic-new-key")
        ).rejects.toMatchObject({
          code: "storage_failed",
        });
        await expect(fs.stat(providerHome)).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    );

    it.each(["ascii", "multibyte"])(
      "rejects an oversized %s write before replacing usable BYOK and OAuth custody",
      async (kind) => {
        await write({
          openrouter: { type: "api", key: "synthetic-existing-key" },
          chatgpt: oauth,
        });
        const previous = await fs.readFile(filename);
        const key =
          kind === "ascii" ? "x".repeat(1_048_576) : "😀".repeat(300_000);
        expect(key.length).toBeLessThanOrEqual(1_048_576);
        const writeFile = vi.spyOn(fs, "writeFile");
        const rename = vi.spyOn(fs, "rename");
        await expect(secrets.set("fal", key)).rejects.toMatchObject({
          code: "storage_failed",
        });
        // No temporary-file write or canonical replacement is begun.
        expect(writeFile).not.toHaveBeenCalled();
        expect(rename).not.toHaveBeenCalled();
        writeFile.mockRestore();
        rename.mockRestore();
        expect((await fs.readFile(filename)).equals(previous)).toBe(true);
        expect(await secrets._getKey("openrouter")).toBe(
          "synthetic-existing-key"
        );
        expect(await secrets.has("fal")).toBe(false);

        const refreshed = { ...oauth, refresh: "synthetic-next-refresh" };
        expect(await auth.replaceIfUnchanged("chatgpt", oauth, refreshed)).toBe(
          true
        );
        await secrets.delete("openrouter");
        expect(await secrets.has("openrouter")).toBe(false);
        expect(await auth.get("chatgpt")).toEqual(refreshed);
        await secrets.set("fal", "synthetic-later-key");
        expect(await secrets._getKey("fal")).toBe("synthetic-later-key");
      }
    );

    it("keeps the previous file after a failed write and permits an explicit retry", async () => {
      await write({ fal: { type: "api", key: "synthetic-old-key" } });
      const rename = vi
        .spyOn(fs, "rename")
        .mockRejectedValueOnce(
          new Error("synthetic error with private provider data")
        );
      await expect(
        secrets.set("fal", "synthetic-new-key")
      ).rejects.toMatchObject({
        code: "storage_failed",
        message: "Grida provider credentials failed (storage_failed)",
      });
      rename.mockRestore();
      expect(await secrets._getKey("fal")).toBe("synthetic-old-key");
      await secrets.set("fal", "synthetic-new-key");
      expect(await secrets._getKey("fal")).toBe("synthetic-new-key");
    });
  }
);
