/**
 * GRIDA-SEC-004 — `auth.json` reader/writer.
 *
 * Lives at `${userDataPath}/auth.json`, chmod 0o600, owned exclusively
 * by the agent host. V1 stores BYOK API key records keyed by provider id.
 * The filename intentionally stays `auth.json`: it is local credential
 * infrastructure, not a hosted OAuth route layer.
 *
 * Schema is intentionally tiny so it can be hand-edited in a pinch and
 * so format drift is obvious:
 *
 *   ```json
 *   {
 *     "openrouter": { "type": "api", "key": "sk-or-..." },
 *     "vercel":     { "type": "api", "key": "..." }
 *   }
 *   ```
 *
 * **Permission discipline.** The file MUST be mode 0o600 (owner-only
 * read/write). On write we set the mode at open time so the FD is
 * never world-readable, even briefly. On read we `fs.stat` first and
 * refuse if any bits in `0o077` (group/world) are set — even reading
 * a too-permissive auth.json could be misinterpreted as "permissions
 * are fine"; better to fail loudly so the user knows their secrets
 * are exposed.
 *
 * **Atomic writes.** Same pattern as `files/io.ts`: write to a
 * sibling `.tmp` file in the same directory, then `rename` into place.
 * `rename` is atomic on POSIX within the same filesystem.
 *
 * **No in-memory cache.** Reads are cheap (small JSON, almost always
 * page-cached), and the agent host is the sole writer so we don't worry
 * about cross-process races on writes. Skipping the cache means we
 * cannot serve stale keys after, e.g., a side-channel where the user
 * `rm`'d auth.json.
 *
 * **Env override.** `GRIDA_AUTH_CONTENT` short-circuits disk I/O when
 * set — lets tests inject a fixed auth state without touching the
 * filesystem. The override is read-only:
 * `writeAll()` still hits disk, but `readAll()` short-circuits before
 * the stat/permission check.
 *
 * **Never log the contents of this file.** Logging the path is fine,
 * logging "wrote auth entry for provider=X user=Y" is fine, logging
 * the API key is a security violation.
 */

import fs from "node:fs/promises";
import path from "node:path";
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

  constructor(userDataPath: string) {
    this.file_path = path.join(userDataPath, FILE_NAME);
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const next = this.write_chain.catch(() => undefined).then(task);
    this.write_chain = next.catch(() => undefined);
    return next;
  }

  /**
   * Read the full auth.json. Returns `{}` if the file is missing
   * (not an error — a fresh install simply hasn't authed yet).
   *
   * **Permission check.** If the file exists, we stat it and refuse to
   * read if the mode has any group/world bits set. The mode is the
   * primary defense for at-rest secrets in V1 (V2.1 wraps with the OS
   * keychain), so silently reading a too-permissive file would mask
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
    await atomicWrite(this.file_path, JSON.stringify(file));
  }

  async get(providerId: string): Promise<AuthInfo | undefined> {
    const all = await this.readAll();
    return all[providerId];
  }

  async set(providerId: string, info: AuthInfo): Promise<void> {
    return this.enqueueWrite(async () => {
      const all = await this.readAll();
      all[providerId] = info;
      await this.writeAll(all);
    });
  }

  async remove(providerId: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const all = await this.readAll();
      if (!(providerId in all)) return;
      delete all[providerId];
      await this.writeAll(all);
    });
  }
}
