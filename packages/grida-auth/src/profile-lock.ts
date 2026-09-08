// GRIDA-SEC-010 — crash-released exclusion; SQLite never stores credentials.
// GRIDA-SEC-014 — provider and native credential writers reuse this lock protocol.
import path from "node:path";
import { lstat } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { isMainThread } from "node:worker_threads";
import { AuthClient } from "./auth-client";
import { privateFiles } from "./private-files";

/** Internal lock for a local private profile directory. Never unlink the DB. */
export class ProfileLock {
  // POSIX fcntl locks can be released by closing another descriptor for the
  // same inode. Serialize every open/close of our lock file within this process.
  private static queue(): Map<string, Promise<void>> {
    const key = Symbol.for("grida.auth.profile-lock.v1");
    const shared = globalThis as typeof globalThis & { [key: symbol]: unknown };
    shared[key] ??= new Map<string, Promise<void>>();
    if (!(shared[key] instanceof Map))
      throw new AuthClient.Failure("custody_failed");
    return shared[key] as Map<string, Promise<void>>;
  }

  constructor(private readonly directory: string) {}

  /** The deadline/signal apply to acquisition, never steal a running callback. */
  async run<T>(
    operation: () => Promise<T>,
    options: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<T> {
    const timeout = options.timeoutMs ?? 30_000;
    if (
      !isMainThread ||
      !Number.isFinite(timeout) ||
      timeout < 0 ||
      timeout > 120_000
    )
      throw new AuthClient.Failure("custody_failed");
    const deadline = performance.now() + timeout;
    const check = () => {
      if (options.signal?.aborted) throw new AuthClient.Failure("cancelled");
      if (timeout > 0 && performance.now() >= deadline)
        throw new AuthClient.Failure("session_busy");
    };
    const wait = async () => {
      check();
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new AuthClient.Failure("session_busy");
      try {
        await delay(Math.min(25, remaining), undefined, {
          signal: options.signal,
        });
      } catch {
        throw new AuthClient.Failure("cancelled");
      }
    };
    check();
    const directory = this.directory;
    const pending = ProfileLock.queue();
    const previous = pending.get(directory);
    let releaseTurn!: () => void;
    const turn = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const queued = previous ? previous.then(() => turn) : turn;
    pending.set(directory, queued);
    let database: DatabaseSync | undefined;
    let acquired = false;
    let callbackStarted = false;
    try {
      if (previous) {
        let available = false;
        void previous.then(() => {
          available = true;
        });
        while (!available) await wait();
      }
      await privateFiles.directory(directory);
      check();
      const filename = path.join(directory, "profile.lock.sqlite");
      const handle = await privateFiles.open(filename, "existing");
      try {
        // A lock-only DB remains empty: no schema, secrets, WAL, or mutation.
        if ((await handle.stat()).size !== 0)
          throw new AuthClient.Failure("custody_failed");
      } finally {
        await handle.close();
      }
      // BEGIN IMMEDIATE on an empty DB creates a private rollback journal.
      // A crashed holder may leave it behind; SQLite owns its recovery.
      try {
        await privateFiles.read(filename + "-journal");
      } catch (error) {
        const exists = await lstat(filename + "-journal").then(
          () => true,
          (probe: NodeJS.ErrnoException) => {
            if (probe.code !== "ENOENT") throw error;
            return false;
          }
        );
        // Another process may complete and remove its journal during validation.
        if (exists) throw error;
      }
      for (const suffix of ["-wal", "-shm"]) {
        try {
          await lstat(filename + suffix);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw new AuthClient.Failure("custody_failed");
        }
        throw new AuthClient.Failure("custody_failed");
      }
      try {
        const sqlite = await import("node:sqlite");
        database = new sqlite.DatabaseSync(filename, {
          timeout: 0,
          allowExtension: false,
        });
        database.exec("PRAGMA busy_timeout = 0");
      } catch {
        throw new AuthClient.Failure("custody_failed");
      }
      while (!acquired) {
        check();
        try {
          database.exec("BEGIN IMMEDIATE");
          acquired = true;
        } catch (error) {
          const code = (error as { errcode?: number }).errcode;
          if (typeof code !== "number" || (code & 0xff) !== 5)
            throw new AuthClient.Failure("custody_failed");
          await wait();
        }
      }
      check();
      // File/keychain mutation intentionally lives outside the SQLite transaction.
      // A rotated credential must remain committed even if this callback rejects.
      callbackStarted = true;
      return await operation();
    } catch (error) {
      if (callbackStarted || error instanceof AuthClient.Failure) throw error;
      throw new AuthClient.Failure("custody_failed");
    } finally {
      try {
        this.release(database, acquired);
      } finally {
        releaseTurn();
        // A cancelled waiter must not remove a queue still held by its predecessor.
        void queued.then(() => {
          if (pending.get(directory) === queued) pending.delete(directory);
        });
      }
    }
  }

  private release(database: DatabaseSync | undefined, acquired: boolean) {
    try {
      try {
        if (acquired) database?.exec("ROLLBACK");
      } finally {
        database?.close();
      }
    } catch {
      throw new AuthClient.Failure("custody_failed");
    }
  }
}
