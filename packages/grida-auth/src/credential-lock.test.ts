// GRIDA-SEC-014 — public native writer lock, private paths and safe acquisition failures.
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialLock } from "./node";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "credential-lock-"))
  );
  roots.push(root);
  const directory = path.join(root, "writer");
  return { root, directory, lock: new CredentialLock({ directory }) };
}

describe.skipIf(!["darwin", "linux"].includes(process.platform))(
  "CredentialLock",
  () => {
    it("constructs without I/O and excludes separate native writers until their work settles", async () => {
      const f = await fixture();
      await expect(fs.stat(f.directory)).rejects.toMatchObject({
        code: "ENOENT",
      });
      let unlock!: () => void;
      let entered!: () => void;
      const hold = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const events: string[] = [];
      const first = f.lock.run(async () => {
        events.push("first");
        entered();
        await hold;
        events.push("released");
      });
      await started;
      const second = new CredentialLock({ directory: f.directory }).run(
        async () => {
          events.push("second");
          return 42;
        }
      );
      await delay(20);
      expect(events).toEqual(["first"]);
      unlock();
      expect(await second).toBe(42);
      await first;
      expect(events).toEqual(["first", "released", "second"]);
    });

    it("preserves callback failure and completed host writes without keeping the lock", async () => {
      const f = await fixture();
      const failure = new Error("synthetic-host-failure");
      await expect(
        f.lock.run(async () => {
          await fs.writeFile(path.join(f.root, "completed"), "synthetic", {
            mode: 0o600,
          });
          throw failure;
        })
      ).rejects.toBe(failure);
      await f.lock.run(async () =>
        expect(await fs.readFile(path.join(f.root, "completed"), "utf8")).toBe(
          "synthetic"
        )
      );
    });

    it("maps unsafe acquisition to a fixed lock failure before calling the host", async () => {
      const f = await fixture();
      await fs.mkdir(f.directory, { mode: 0o755 });
      const callback = vi.fn<() => Promise<void>>(async () => {});
      await expect(f.lock.run(callback)).rejects.toMatchObject({
        code: "storage_failed",
        message: "Grida credential lock failed (storage_failed)",
      });
      expect(callback).not.toHaveBeenCalled();
      expect((await fs.stat(f.directory)).mode & 0o7777).toBe(0o755);
    });

    it.each(["relative", "/", "/private/../tmp/test", "/private/tmp/test\n"])(
      "rejects noncanonical lock directory %s at construction",
      (directory) => {
        expect(() => new CredentialLock({ directory })).toThrow(
          "Grida credential lock failed (invalid_input)"
        );
      }
    );

    it("refuses unsupported platforms before I/O", async () => {
      const f = await fixture();
      vi.spyOn(process, "platform", "get").mockReturnValue("win32");
      await expect(f.lock.run(async () => {})).rejects.toMatchObject({
        code: "unsupported_platform",
      });
      await expect(fs.stat(f.directory)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  }
);
