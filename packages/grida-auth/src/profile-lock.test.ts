// GRIDA-SEC-010 — exclusion, cancellation, and OS-released crash locks.
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileLock } from "./profile-lock";
import { privateFiles } from "./private-files";

const roots: string[] = [];
const children = new Set<ChildProcess>();
afterEach(async () => {
  vi.restoreAllMocks();
  vi.doUnmock("node:worker_threads");
  for (const child of children) child.kill("SIGKILL");
  children.clear();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "auth-lock-"))
  );
  roots.push(root);
  const directory = path.join(root, "profile");
  return { directory, lock: new ProfileLock(directory) };
}

async function holder(filename: string) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1], {timeout: 0});
    db.exec('BEGIN IMMEDIATE');
    process.send({ready: true});
    process.on('message', () => { db.exec('ROLLBACK'); db.close(); process.exit(0); });
  `,
      filename,
    ],
    { env: {}, stdio: ["ignore", "ignore", "ignore", "ipc"] }
  );
  children.add(child);
  const exit = new Promise<void>((resolve) =>
    child.once("exit", () => {
      children.delete(child);
      resolve();
    })
  );
  await new Promise<void>((resolve, reject) => {
    child.once("message", () => resolve());
    child.once("error", () =>
      reject(new Error("Synthetic lock holder failed"))
    );
    child.once("exit", () =>
      reject(new Error("Synthetic lock holder exited before readiness"))
    );
  });
  return { child, exit };
}

describe.skipIf(process.platform === "win32")("ProfileLock", () => {
  it("serializes async callbacks across instances in the same process", async () => {
    const f = await fixture();
    const entered = deferred();
    const release = deferred();
    const order: string[] = [];
    const first = f.lock.run(async () => {
      order.push("first");
      entered.resolve();
      await release.promise;
      order.push("released");
    });
    await entered.promise;
    const second = new ProfileLock(f.directory).run(async () => {
      order.push("second");
    });
    await delay(30);
    expect(order).toEqual(["first"]);
    release.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "released", "second"]);
  });

  it("never rolls back an external credential rotation when the callback fails", async () => {
    const f = await fixture();
    const filename = path.join(f.directory, "session.json");
    await expect(
      f.lock.run(async () => {
        await privateFiles.atomicWrite(filename, "synthetic-rotation");
        throw new Error("identity unavailable");
      })
    ).rejects.toThrow("identity unavailable");
    await f.lock.run(async () => {
      expect(await privateFiles.read(filename)).toBe("synthetic-rotation");
    });
    expect(
      (await fs.stat(path.join(f.directory, "profile.lock.sqlite"))).size
    ).toBe(0);
  });

  it("returns busy without running a callback or stealing another process's lock", async () => {
    const f = await fixture();
    await f.lock.run(async () => undefined);
    const held = await holder(path.join(f.directory, "profile.lock.sqlite"));
    let entered = false;
    await expect(
      f.lock.run(
        async () => {
          entered = true;
        },
        { timeoutMs: 30 }
      )
    ).rejects.toMatchObject({ code: "session_busy" });
    expect(entered).toBe(false);
    held.child.send("release");
    await held.exit;
    await f.lock.run(async () => {
      entered = true;
    });
    expect(entered).toBe(true);
  });

  it("reacquires after SIGKILL without stale PID files, timeout stealing, or database replacement", async () => {
    const f = await fixture();
    await f.lock.run(async () => undefined);
    const filename = path.join(f.directory, "profile.lock.sqlite");
    const inode = (await fs.stat(filename)).ino;
    const held = await holder(filename);
    await expect(
      f.lock.run(async () => undefined, { timeoutMs: 0 })
    ).rejects.toMatchObject({ code: "session_busy" });
    held.child.kill("SIGKILL");
    await held.exit;
    expect(await f.lock.run(async () => "recovered")).toBe("recovered");
    expect((await fs.stat(filename)).ino).toBe(inode);
  });

  it("cancels a waiting acquisition and leaves the live holder untouched", async () => {
    const f = await fixture();
    const entered = deferred();
    const release = deferred();
    const first = f.lock.run(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const controller = new AbortController();
    const waiting = f.lock.run(
      async () => {
        throw new Error("must not run");
      },
      { signal: controller.signal }
    );
    const rejected = waiting.catch((error: unknown) => error);
    controller.abort();
    expect(await rejected).toMatchObject({ code: "cancelled" });
    await expect(
      f.lock.run(async () => undefined, { timeoutMs: 0 })
    ).rejects.toMatchObject({ code: "session_busy" });
    release.resolve();
    await first;
  });

  it("does not expire a held callback when its acquisition deadline passes", async () => {
    const f = await fixture();
    expect(
      await f.lock.run(
        async () => {
          await delay(30);
          return "finished";
        },
        { timeoutMs: 0 }
      )
    ).toBe("finished");
  });

  it("refuses nonempty SQLite files rather than opening an unrelated database", async () => {
    const f = await fixture();
    const filename = path.join(f.directory, "profile.lock.sqlite");
    await privateFiles.atomicWrite(filename, "not-a-lock-database");
    await expect(f.lock.run(async () => undefined)).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(await privateFiles.read(filename)).toBe("not-a-lock-database");
  });

  it.each(["-wal", "-shm"])(
    "refuses unexpected SQLite %s sidecars before opening the database",
    async (suffix) => {
      const f = await fixture();
      const filename = path.join(f.directory, "profile.lock.sqlite");
      await privateFiles.atomicWrite(filename + suffix, "unexpected");
      await expect(f.lock.run(async () => undefined)).rejects.toMatchObject({
        code: "custody_failed",
      });
      expect(await privateFiles.read(filename + suffix)).toBe("unexpected");
    }
  );

  it("refuses a rollback journal with unsafe permissions", async () => {
    const f = await fixture();
    await privateFiles.directory(f.directory);
    const journal = path.join(f.directory, "profile.lock.sqlite-journal");
    await fs.writeFile(journal, "unexpected", { mode: 0o644 });
    await expect(f.lock.run(async () => undefined)).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(await fs.readFile(journal, "utf8")).toBe("unexpected");
  });

  it("does not let a cancelled middle waiter release or bypass the live holder", async () => {
    const f = await fixture();
    const entered = deferred();
    const release = deferred();
    const first = f.lock.run(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const controller = new AbortController();
    const cancelled = f.lock
      .run(async () => undefined, { signal: controller.signal })
      .catch((error: unknown) => error);
    controller.abort();
    expect(await cancelled).toMatchObject({ code: "cancelled" });
    let enteredLast = false;
    const last = new ProfileLock(f.directory).run(async () => {
      enteredLast = true;
    });
    await delay(30);
    expect(enteredLast).toBe(false);
    release.resolve();
    await Promise.all([first, last]);
    expect(enteredLast).toBe(true);
  });

  it("coordinates separately loaded module copies in the same process", async () => {
    const f = await fixture();
    const entered = deferred();
    const release = deferred();
    const held = f.lock.run(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    try {
      vi.resetModules();
      const { ProfileLock: OtherLock } = await import("./profile-lock");
      expect(OtherLock).not.toBe(ProfileLock);
      await expect(
        new OtherLock(f.directory).run(async () => undefined, { timeoutMs: 0 })
      ).rejects.toMatchObject({ code: "session_busy" });
    } finally {
      release.resolve();
      await held;
    }
  });

  it("fails a positive acquisition deadline reached during filesystem setup", async () => {
    const f = await fixture();
    const original = privateFiles.directory;
    vi.spyOn(privateFiles, "directory").mockImplementation(
      async (directory) => {
        await delay(30);
        return original(directory);
      }
    );
    let entered = false;
    await expect(
      f.lock.run(
        async () => {
          entered = true;
        },
        { timeoutMs: 10 }
      )
    ).rejects.toMatchObject({ code: "session_busy" });
    expect(entered).toBe(false);
  });

  it("fails closed before worker-thread custody can touch the profile", async () => {
    const f = await fixture();
    vi.resetModules();
    vi.doMock("node:worker_threads", () => ({ isMainThread: false }));
    const { ProfileLock: WorkerLock } = await import("./profile-lock");
    await expect(
      new WorkerLock(f.directory).run(async () => undefined)
    ).rejects.toMatchObject({ code: "custody_failed" });
    await expect(fs.stat(f.directory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
