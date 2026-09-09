/**
 * GRIDA-SEC-004 / GRIDA-SEC-008 / GRIDA-SEC-014 — native OAuth custody and
 * bounded retirement of the former mixed API-key/OAuth file.
 *
 * OAuth remains in user_data_path/auth.json. New API-key writes are refused
 * on shared-custody platforms. Windows retains its host-local API-key backend.
 * Updated macOS/Linux writers and migration share a crash-released lock in
 * .auth-lock; lock order is legacy file then canonical provider store. Old
 * application versions do not participate and must not write concurrently.
 * Windows retains the previous native writer queue; shared BYOK is unsupported.
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
const MAX_AUTH_FILE_BYTES = 1_048_576;

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
  private readonly platform = process.platform;
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
        if (this.platform === "win32") return task();
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
   * **Permission check.** POSIX hosts refuse files with group/world bits.
   * Windows uses its inherited ACL; stat mode bits do not establish access
   * rights there. This legacy backend does not validate Windows DACLs.
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
    // Windows stat mode bits do not describe its inherited ACL. Keep native
    // compatibility without claiming the shared POSIX custody guarantees.
    if (this.platform !== "win32" && (stat.mode & OWNER_ONLY_MASK) !== 0) {
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
   * Atomic write — temporary files request mode `0o600`. POSIX enforces that
   * mode; the Windows compatibility backend retains its inherited ACL limits.
   */
  async writeAll(file: AuthFile): Promise<void> {
    for (const entry of Object.values(file)) this.checkApiWrite(entry);
    return this.enqueueWrite(() => this.persist(file));
  }

  private checkApiWrite(entry: AuthInfo): void {
    if (entry.type !== "api") return;
    if (this.platform !== "win32")
      throw new Error("API keys require the shared provider credential store");
    if (
      typeof entry.key !== "string" ||
      !entry.key.trim() ||
      !entry.key.isWellFormed()
    )
      throw new Error("Legacy provider credential is invalid");
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
        opened.size > MAX_AUTH_FILE_BYTES
      ) {
        throw new Error();
      }
      const bytes = await handle.readFile();
      if (bytes.byteLength > MAX_AUTH_FILE_BYTES) throw new Error();
      const raw = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      for (const entry of Object.values(value)) {
        if (
          this.platform === "win32" &&
          (!entry ||
            typeof entry !== "object" ||
            Array.isArray(entry) ||
            (entry.type !== "api" && entry.type !== "oauth"))
        )
          throw new Error();
        if (
          entry?.type === "api" &&
          (typeof entry.key !== "string" ||
            // The POSIX importer still retires formerly absent blank entries;
            // a configured Windows key cannot silently become GG eligibility.
            (this.platform === "win32" && !entry.key.trim()) ||
            !entry.key.isWellFormed())
        )
          throw new Error();
      }
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
      (this.platform !== "win32" &&
        ((stat.mode & 0o7777) !== 0o600 ||
          (process.geteuid && stat.uid !== process.geteuid())))
    ) {
      throw new Error("Legacy credential storage is invalid or unavailable");
    }
  }

  private async checkAcl(filename: string): Promise<void> {
    if (this.platform !== "darwin") return;
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
    if (this.platform === "win32") return;
    const handle = await fs.open(this.userDataPath, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async persist(file: AuthFile): Promise<void> {
    // Publish only documents the strict reader can reopen. Serialize once so
    // the byte-bound check covers exactly the bytes sent to either writer.
    const serialized = JSON.stringify(file);
    if (Buffer.byteLength(serialized, "utf8") > MAX_AUTH_FILE_BYTES)
      throw new Error("Legacy credential storage is invalid or unavailable");
    if (this.platform === "win32") {
      await atomicWrite(this.file_path, serialized);
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
        await handle.writeFile(serialized, "utf8");
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

  /**
   * Windows compatibility only. Strict disk reads never turn corrupt custody
   * into an absent provider or import the legacy test environment override.
   * Shared-custody hosts must use ProviderCredentialStore instead.
   */
  async getLegacyProviderKey(providerId: string): Promise<string | null> {
    if (this.platform !== "win32")
      throw new Error("API keys require the shared provider credential store");
    const all = await this.readDisk();
    if (!Object.hasOwn(all, providerId)) return null;
    const entry = all[providerId];
    if (entry?.type === "oauth") return null;
    if (
      !entry ||
      entry.type !== "api" ||
      typeof entry.key !== "string" ||
      !entry.key.isWellFormed()
    )
      throw new Error("Legacy credential storage is invalid or unavailable");
    return entry.key;
  }

  /** Windows provider deletion cannot remove an unrelated OAuth connection. */
  async removeLegacyProviderKey(providerId: string): Promise<void> {
    if (this.platform !== "win32")
      throw new Error("API keys require the shared provider credential store");
    return this.enqueueWrite(async () => {
      const all = await this.readDisk();
      if (all[providerId]?.type !== "api") return;
      delete all[providerId];
      await this.persist(all);
    });
  }

  async set(providerId: string, info: AuthInfo): Promise<void> {
    this.checkApiWrite(info);
    return this.enqueueWrite(async () => {
      const all = await this.readDisk();
      if (info.type === "api" && all[providerId]?.type === "oauth")
        throw new Error("Provider keys cannot replace an OAuth connection");
      all[providerId] = info;
      await this.persist(all);
    });
  }

  async remove(providerId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const all = await this.readDisk();
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
      const all = await this.readDisk();
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
    this.checkApiWrite(next);
    return this.enqueueWrite(async () => {
      const all = await this.readDisk();
      if (!isDeepStrictEqual(all[providerId], expected)) return false;
      all[providerId] = next;
      await this.persist(all);
      return true;
    });
  }
}
