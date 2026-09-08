/**
 * GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — native OAuth custody and
 * bounded retirement of the former mixed API-key/OAuth file.
 *
 * OAuth remains in user_data_path/auth.json. New API-key writes are refused.
 * Updated macOS/Linux writers and migration share a crash-released lock in
 * .auth-lock; lock order is legacy file then canonical provider store. Old
 * application versions do not participate and must not write concurrently.
 * Windows retains the previous OAuth queue; shared BYOK is unsupported there.
 */

import fs from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { CredentialLock } from "@grida/auth/node";
import type { ProviderCredentialStore } from "@grida/auth/providers";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { atomicWrite } from "../storage/atomic-write";

export type OAuthEntry = {
  type: "oauth";
  refresh: string;
  access: string;
  /**
   * Epoch seconds. OAuth providers commonly return token expiry in
   * seconds, not milliseconds.
   */
  expires: number;
  account_id?: string;
  email?: string;
  /** Provider-reported subscription plan, for display only. */
  plan?: string;
  /** Provider-owned bookkeeping; never exposed through credential routes. */
  metadata?: Record<string, string>;
};

export type ApiKeyEntry = {
  type: "api";
  key: string;
  metadata?: Record<string, string>;
};

export type AuthInfo = OAuthEntry | ApiKeyEntry;

/** Keyed by provider id. */
export type AuthFile = Record<string, AuthInfo>;

const FILE_NAME = "auth.json";
const ENV_OVERRIDE = "GRIDA_AUTH_CONTENT";

/** Bits we refuse to see in the mode — anything outside owner. */
const OWNER_ONLY_MASK = 0o077;

export class AuthPermissionsError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly mode: number
  ) {
    super(
      `[grida-daemon-auth] auth.json permissions too wide (mode=0o${mode.toString(8).padStart(3, "0")}); refusing to read`
    );
    this.name = "AuthPermissionsError";
  }
}

export class AuthStore {
  private readonly file_path: string;
  /**
   * Serializes `set` / `remove` so two concurrent mutations can't
   * lose-update each other. Both ops follow read-modify-write on a
   * shared file; without this chain a parallel set('openrouter', …)
   * and set('vercel', …) would both `readAll` the same starting
   * state, both `writeAll`, and the second `rename` wins — silently
   * dropping the first key. The `.catch(() => undefined)` on the
   * chain swallows rejection so a single failed write doesn't strand
   * all subsequent writes; the caller still sees the real rejection
   * on the returned promise.
   */
  private write_chain: Promise<unknown> = Promise.resolve();

  readonly userDataPath: string;

  constructor(userDataPath: string) {
    this.userDataPath = path.resolve(userDataPath);
    this.file_path = path.join(this.userDataPath, FILE_NAME);
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const next = this.write_chain
      .catch(() => undefined)
      .then(async () => {
        if (process.platform === "win32") return task();
        // A legacy agent directory may already be 0755. The lock gets its own
        // private subtree; no existing directory permissions are repaired.
        await fs.mkdir(this.userDataPath, { recursive: true, mode: 0o700 });
        const directory = await fs.realpath(this.userDataPath);
        return new CredentialLock({
          directory: path.join(directory, ".auth-lock"),
        }).run(task);
      });
    this.write_chain = next.catch(() => undefined);
    return next;
  }

  /**
   * Read the full auth.json. Returns `{}` if the file is missing
   * (not an error — a fresh install simply hasn't authed yet).
   *
   * **Permission check.** If the file exists, we stat it and refuse to
   * read if the mode has any group/world bits set. The mode is the
   * at-rest protection for this OAuth file; silently reading a
   * too-permissive file would mask
   * the problem.
   */
  async readAll(): Promise<AuthFile> {
    const override = process.env[ENV_OVERRIDE];
    if (override !== undefined && override !== "") {
      try {
        const parsed = JSON.parse(override);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as AuthFile;
        }
      } catch {
        // override was unparseable — fall through to disk
      }
    }

    let stat: { mode: number };
    try {
      stat = await fs.stat(this.file_path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
    if ((stat.mode & OWNER_ONLY_MASK) !== 0) {
      throw new AuthPermissionsError(this.file_path, stat.mode & 0o777);
    }
    const raw = await fs.readFile(this.file_path, "utf8");
    if (raw.length === 0) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as AuthFile;
      }
    } catch {
      // Malformed JSON — corrupt auth.json is treated as no auth.
      // The user can re-sign-in and we overwrite cleanly.
    }
    return {};
  }

  /**
   * Atomic write — `atomicWrite` defaults the tmp mode to `0o600` so a
   * half-written or orphaned tmp is never world-readable.
   */
  async writeAll(file: AuthFile): Promise<void> {
    if (Object.values(file).some((entry) => entry.type === "api")) {
      throw new Error("API keys require the shared provider credential store");
    }
    return this.enqueueWrite(() => this.persist(file));
  }

  /**
   * Fixed migration seam: the source lock covers producer publication and
   * retirement. Completed canonical migration never reads this source again.
   * GRIDA_AUTH_CONTENT is intentionally not a migration source.
   */
  async migrateProviderKeys(store: ProviderCredentialStore): Promise<void> {
    await this.enqueueWrite(async () => {
      await store.migrate({
        read: async () => {
          const all = await this.readDisk();
          return Object.entries(all).flatMap(([provider, entry]) => {
            if (entry?.type !== "api") return [];
            if (typeof entry.key !== "string")
              throw new Error("Invalid legacy provider credential");
            return entry.key.trim().length === 0
              ? []
              : [{ provider, apiKey: entry.key }];
          });
        },
        retire: async () => {
          const all = await this.readDisk();
          const remaining = Object.fromEntries(
            Object.entries(all).filter(([, entry]) => entry?.type !== "api")
          );
          if (Object.keys(remaining).length !== Object.keys(all).length) {
            await this.persist(remaining);
          }
          await this.cleanup();
        },
      });
    });
  }

  private async readForMutation(): Promise<AuthFile> {
    return process.platform === "win32" ? this.readAll() : this.readDisk();
  }

  private async readDisk(): Promise<AuthFile> {
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      const stat = await fs.lstat(this.file_path);
      this.checkFile(stat);
      await this.checkAcl(this.file_path);
      handle = await fs.open(
        this.file_path,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      const opened = await handle.stat();
      this.checkFile(opened);
      if (
        opened.dev !== stat.dev ||
        opened.ino !== stat.ino ||
        opened.size > 1_048_576
      ) {
        throw new Error();
      }
      const bytes = await handle.readFile();
      if (bytes.byteLength > 1_048_576) throw new Error();
      const raw = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      return value as AuthFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT" && !handle)
        return {};
      throw new Error("Legacy credential storage is invalid or unavailable");
    } finally {
      await handle?.close();
    }
  }

  private checkFile(stat: Stats): void {
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o7777) !== 0o600 ||
      (process.geteuid && stat.uid !== process.geteuid())
    ) {
      throw new Error("Legacy credential storage is invalid or unavailable");
    }
  }

  private async checkAcl(filename: string): Promise<void> {
    if (process.platform !== "darwin") return;
    const { stdout } = await promisify(execFile)(
      "/bin/ls",
      ["-lde", filename],
      {
        env: { LC_ALL: "C", LANG: "C" },
        timeout: 2000,
        maxBuffer: 65_536,
      }
    );
    if (/^\s*\d+:.*\ballow\b/m.test(stdout)) throw new Error();
  }

  private async cleanup(): Promise<void> {
    for (const filename of await fs.readdir(this.userDataPath)) {
      if (!/^\.auth\.json\.[0-9a-f]{16}\.tmp$/.test(filename)) continue;
      const full = path.join(this.userDataPath, filename);
      this.checkFile(await fs.lstat(full));
      await this.checkAcl(full);
      await fs.unlink(full);
    }
    await this.syncDirectory();
  }

  private async syncDirectory(): Promise<void> {
    if (process.platform === "win32") return;
    const handle = await fs.open(this.userDataPath, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async persist(file: AuthFile): Promise<void> {
    if (process.platform === "win32") {
      await atomicWrite(this.file_path, JSON.stringify(file));
      return;
    }
    const temporary = path.join(
      this.userDataPath,
      `.auth.json.${randomBytes(8).toString("hex")}.tmp`
    );
    let staged = false;
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      staged = true;
      try {
        await handle.writeFile(JSON.stringify(file), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, this.file_path);
      staged = false;
      // A post-rename failure never rolls back a newly committed OAuth token.
      await this.syncDirectory();
    } finally {
      if (staged) await fs.unlink(temporary).catch(() => undefined);
    }
  }

  async get(providerId: string): Promise<AuthInfo | undefined> {
    const all = await this.readAll();
    return all[providerId];
  }

  async set(providerId: string, info: AuthInfo): Promise<void> {
    if (info.type === "api")
      throw new Error("API keys require the shared provider credential store");
    return this.enqueueWrite(async () => {
      const all = await this.readForMutation();
      all[providerId] = info;
      await this.persist(all);
    });
  }

  async remove(providerId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const all = await this.readForMutation();
      if (!(providerId in all)) return;
      delete all[providerId];
      await this.persist(all);
    });
  }

  /**
   * Compare-and-remove on the same mutation chain as set/remove.
   *
   * OAuth cancellation uses this after an in-flight exchange: a cancelled
   * attempt may remove only the exact record it wrote, never a newer sign-in
   * that won the provider slot meanwhile.
   */
  async removeIfUnchanged(
    providerId: string,
    expected: AuthInfo
  ): Promise<boolean> {
    return this.enqueueWrite(async () => {
      const all = await this.readForMutation();
      if (!isDeepStrictEqual(all[providerId], expected)) return false;
      delete all[providerId];
      await this.persist(all);
      return true;
    });
  }

  /**
   * Compare-and-replace on the shared mutation chain.
   *
   * A slow token refresh may finish after a new OAuth ceremony has installed
   * a different account. Replacing only the record the refresh actually read
   * prevents that late response from rolling the provider slot back.
   */
  async replaceIfUnchanged(
    providerId: string,
    expected: AuthInfo,
    next: AuthInfo
  ): Promise<boolean> {
    if (next.type === "api")
      throw new Error("API keys require the shared provider credential store");
    return this.enqueueWrite(async () => {
      const all = await this.readForMutation();
      if (!isDeepStrictEqual(all[providerId], expected)) return false;
      all[providerId] = next;
      await this.persist(all);
      return true;
    });
  }
}
