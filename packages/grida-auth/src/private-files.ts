// GRIDA-SEC-010 — owner-only local files; no ambient credential discovery.
// GRIDA-SEC-014 — shared private native provider-file foundations.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isMainThread } from "node:worker_threads";
import { AuthClient } from "./auth-client";

/** Internal POSIX custody primitives. Call mutations under the profile lock. */
export namespace privateFiles {
  const execute = promisify(execFile);
  const limit = 1_048_576;

  function fail(): never {
    throw new AuthClient.Failure("custody_failed");
  }

  function location(value: string): string {
    // Windows mode bits do not establish a user-only DACL. Fail before I/O
    // until a Windows ACL adapter has its own real-platform protection tests.
    if (
      !["darwin", "linux"].includes(process.platform) ||
      !isMainThread ||
      !process.geteuid ||
      !path.isAbsolute(value) ||
      path.resolve(value) !== value ||
      ["\0", "\r", "\n"].some((control) => value.includes(control))
    )
      fail();
    return value;
  }

  function missing(error: unknown): boolean {
    return (error as NodeJS.ErrnoException)?.code === "ENOENT";
  }

  function owned(stat: Stats, kind: "directory" | "file") {
    if (
      stat.uid !== process.geteuid!() ||
      (stat.mode & 0o7777) !== (kind === "directory" ? 0o700 : 0o600) ||
      (kind === "directory"
        ? !stat.isDirectory()
        : !stat.isFile() || stat.nlink !== 1)
    )
      fail();
  }

  async function acl(filename: string) {
    if (process.platform !== "darwin") return;
    // macOS ACL grants are independent of POSIX mode bits. Deny entries are
    // harmless; reject all additional allow entries, including inherited ones.
    const { stdout } = await execute("/bin/ls", ["-lde", filename], {
      env: { LC_ALL: "C", LANG: "C" },
      timeout: 2000,
      maxBuffer: 65_536,
    });
    if (/^\s*\d+:.*\ballow\b/m.test(stdout)) fail();
  }

  /** Creates missing directories privately; never repairs an existing path. */
  export async function directory(value: string): Promise<string> {
    try {
      location(value);
      const segments = value.split(path.sep).filter(Boolean);
      let current = path.parse(value).root;
      for (let index = 0; index < segments.length; index++) {
        current = path.join(current, segments[index]!);
        try {
          await fs.mkdir(current, { mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
        const stat = await fs.lstat(current);
        if (!stat.isDirectory() || (await fs.realpath(current)) !== current)
          fail();
        if (index === segments.length - 1) owned(stat, "directory");
        else {
          // Existing ancestors can be readable, but not writable by others.
          // A root-owned sticky temporary directory is the one shared exception.
          const sharedTemporary = stat.uid === 0 && (stat.mode & 0o1000) !== 0;
          if (
            (stat.uid !== process.geteuid!() && stat.uid !== 0) ||
            ((stat.mode & 0o022) !== 0 && !sharedTemporary)
          )
            fail();
        }
        await acl(current);
      }
      if (segments.length === 0) fail();
      return value;
    } catch {
      return fail();
    }
  }

  /** `existing` creates a missing empty file exclusively or opens it unchanged. */
  export async function open(
    filename: string,
    mode: "read" | "create" | "existing"
  ): Promise<fs.FileHandle> {
    let handle: fs.FileHandle | undefined;
    try {
      location(filename);
      await directory(path.dirname(filename));
      const guarded = constants.O_NOFOLLOW | constants.O_NONBLOCK;
      if (mode === "read") {
        handle = await fs.open(filename, constants.O_RDONLY | guarded);
      } else {
        try {
          handle = await fs.open(
            filename,
            constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | guarded,
            0o600
          );
        } catch (error) {
          if (
            mode !== "existing" ||
            (error as NodeJS.ErrnoException).code !== "EEXIST"
          )
            throw error;
          handle = await fs.open(filename, constants.O_RDWR | guarded);
        }
      }
      const stat = await handle.stat();
      owned(stat, "file");
      const named = await fs.lstat(filename);
      owned(named, "file");
      if (named.dev !== stat.dev || named.ino !== stat.ino) fail();
      await acl(filename);
      return handle;
    } catch {
      await handle?.close().catch(() => undefined);
      return fail();
    }
  }

  /** Bounded UTF-8 read. Absence is the only condition represented by null. */
  export async function read(filename: string): Promise<string | null> {
    let handle: fs.FileHandle | undefined;
    try {
      location(filename);
      await directory(path.dirname(filename));
      try {
        await fs.lstat(filename);
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
      handle = await open(filename, "read");
      if ((await handle.stat()).size > limit) fail();
      const bytes = await handle.readFile();
      if (bytes.length > limit) fail();
      return bytes.toString("utf8");
    } catch {
      return fail();
    } finally {
      await handle?.close().catch(() => fail());
    }
  }

  /** Fsync the replacement, atomically rename, then fsync its private directory.
   * A post-rename fsync failure rejects with the complete replacement retained;
   * never compensate that uncertain commit by restoring an old refresh token.
   */
  export async function atomicWrite(
    filename: string,
    value: string
  ): Promise<void> {
    let handle: fs.FileHandle | undefined;
    let temporary: string | undefined;
    try {
      location(filename);
      if (Buffer.byteLength(value, "utf8") > limit) fail();
      await directory(path.dirname(filename));
      try {
        await fs.lstat(filename);
        const existing = await open(filename, "read");
        await existing.close();
      } catch (error) {
        if (!missing(error)) throw error;
      }
      temporary = `${filename}.${randomUUID()}.tmp`;
      handle = await open(temporary, "create");
      await handle.writeFile(value, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(temporary, filename);
      temporary = undefined;
      await syncDirectory(path.dirname(filename));
    } catch {
      fail();
    } finally {
      await handle?.close().catch(() => undefined);
      if (temporary) await fs.unlink(temporary).catch(() => undefined);
    }
  }

  /** Under the profile lock, discard only this writer's private orphan temps.
   * An unpublished replacement is never adopted as the current credential.
   */
  export async function cleanup(filename: string): Promise<void> {
    try {
      location(filename);
      const parent = await directory(path.dirname(filename));
      const prefix = `${path.basename(filename)}.`;
      let removed = false;
      for (const name of await fs.readdir(parent)) {
        if (
          !name.startsWith(prefix) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/.test(
            name.slice(prefix.length)
          )
        )
          continue;
        const candidate = path.join(parent, name);
        const handle = await open(candidate, "read");
        await handle.close();
        await fs.unlink(candidate);
        removed = true;
      }
      if (removed) await syncDirectory(parent);
    } catch {
      fail();
    }
  }

  async function syncDirectory(directory: string) {
    const parent = await fs.open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
}
