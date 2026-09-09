// GRIDA-SEC-010 — private disposable file permissions and replacement regressions.
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { privateFiles } from "./private-files";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "auth-files-"))
  );
  roots.push(root);
  return {
    root,
    directory: path.join(root, "profile"),
    file: path.join(root, "profile", "session.json"),
  };
}

describe.skipIf(process.platform === "win32")("privateFiles", () => {
  it("creates private directories and round-trips atomic files without remnants", async () => {
    const f = await fixture();
    expect(await privateFiles.read(f.file)).toBeNull();
    expect((await fs.stat(f.directory)).mode & 0o7777).toBe(0o700);
    await privateFiles.atomicWrite(f.file, "synthetic-initial");
    await privateFiles.atomicWrite(f.file, "synthetic-rotated");
    expect(await privateFiles.read(f.file)).toBe("synthetic-rotated");
    expect((await fs.stat(f.file)).mode & 0o7777).toBe(0o600);
    expect(await fs.readdir(f.directory)).toEqual(["session.json"]);
  });

  it("handles concurrent private directory and empty lock-file creation", async () => {
    const f = await fixture();
    await Promise.all(
      Array.from({ length: 5 }, () => privateFiles.directory(f.directory))
    );
    const handles = await Promise.all(
      Array.from({ length: 5 }, () => privateFiles.open(f.file, "existing"))
    );
    const identities = await Promise.all(
      handles.map((handle) => handle.stat())
    );
    await Promise.all(handles.map((handle) => handle.close()));
    expect(new Set(identities.map((stat) => stat.ino)).size).toBe(1);
    expect(identities.every((stat) => (stat.mode & 0o7777) === 0o600)).toBe(
      true
    );
  });

  it("rejects loose existing directory permissions without changing them", async () => {
    const f = await fixture();
    await fs.mkdir(f.directory, { mode: 0o755 });
    await expect(privateFiles.directory(f.directory)).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect((await fs.stat(f.directory)).mode & 0o7777).toBe(0o755);
  });

  it.each(["file", "directory"] as const)(
    "refuses a symbolic %s path",
    async (kind) => {
      const f = await fixture();
      await privateFiles.directory(f.directory);
      const target = path.join(f.root, "target");
      if (kind === "file")
        await fs.writeFile(target, "unchanged", { mode: 0o600 });
      else await fs.mkdir(target, { mode: 0o700 });
      const link = kind === "file" ? f.file : path.join(f.root, "alias");
      await fs.symlink(target, link);
      const result =
        kind === "file"
          ? privateFiles.read(link)
          : privateFiles.directory(link);
      await expect(result).rejects.toMatchObject({ code: "custody_failed" });
    }
  );

  it("refuses a symlink ancestor before creating descendants", async () => {
    const f = await fixture();
    const alias = path.join(f.root, "alias");
    await fs.symlink(f.root, alias);
    await expect(
      privateFiles.directory(path.join(alias, "private"))
    ).rejects.toMatchObject({ code: "custody_failed" });
    await expect(fs.stat(path.join(f.root, "private"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses hardlinked credentials without replacing either name", async () => {
    const f = await fixture();
    await privateFiles.directory(f.directory);
    await fs.writeFile(f.file, "unchanged", { mode: 0o600 });
    await fs.link(f.file, path.join(f.directory, "alias"));
    await expect(privateFiles.read(f.file)).rejects.toMatchObject({
      code: "custody_failed",
    });
    await expect(
      privateFiles.atomicWrite(f.file, "replacement")
    ).rejects.toMatchObject({ code: "custody_failed" });
    expect(await fs.readFile(f.file, "utf8")).toBe("unchanged");
  });

  it("refuses permissive files and non-files without fixing their metadata", async () => {
    const f = await fixture();
    await privateFiles.directory(f.directory);
    await fs.writeFile(f.file, "unchanged", { mode: 0o644 });
    await expect(privateFiles.read(f.file)).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect((await fs.stat(f.file)).mode & 0o7777).toBe(0o644);
    await fs.unlink(f.file);
    await fs.mkdir(f.file, { mode: 0o700 });
    await expect(privateFiles.open(f.file, "read")).rejects.toMatchObject({
      code: "custody_failed",
    });
  });

  it("bounds read/write payloads and leaves an existing file intact on refusal", async () => {
    const f = await fixture();
    await privateFiles.atomicWrite(f.file, "initial");
    await expect(
      privateFiles.atomicWrite(f.file, "x".repeat(1_048_577))
    ).rejects.toMatchObject({ code: "custody_failed" });
    expect(await privateFiles.read(f.file)).toBe("initial");
    await fs.writeFile(f.file, "x".repeat(1_048_577));
    await expect(privateFiles.read(f.file)).rejects.toMatchObject({
      code: "custody_failed",
    });
  });

  it.skipIf(process.platform !== "darwin")(
    "refuses macOS ACL grants hidden behind owner-only mode bits",
    async () => {
      const f = await fixture();
      await privateFiles.atomicWrite(f.file, "synthetic");
      await promisify(execFile)("/bin/chmod", [
        "+a",
        "everyone allow read",
        f.file,
      ]);
      expect((await fs.stat(f.file)).mode & 0o7777).toBe(0o600);
      await expect(privateFiles.read(f.file)).rejects.toMatchObject({
        code: "custody_failed",
      });
    }
  );

  it("fails closed on Windows before creating a profile", async () => {
    const f = await fixture();
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    await expect(privateFiles.directory(f.directory)).rejects.toMatchObject({
      code: "custody_failed",
    });
    await expect(fs.stat(f.directory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps the complete replacement when directory fsync fails after rename", async () => {
    const f = await fixture();
    await privateFiles.atomicWrite(f.file, "initial");
    const handle = await fs.open(f.file, "r");
    const prototype = Object.getPrototypeOf(handle) as fs.FileHandle;
    const original = prototype.sync;
    await handle.close();
    vi.spyOn(prototype, "sync").mockImplementation(
      async function (this: fs.FileHandle) {
        if ((await this.stat()).isDirectory())
          throw new Error("private storage detail");
        await original.call(this);
      }
    );
    await expect(
      privateFiles.atomicWrite(f.file, "accepted-rotation")
    ).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
    expect(await privateFiles.read(f.file)).toBe("accepted-rotation");
    expect(await fs.readdir(f.directory)).toEqual(["session.json"]);
  });

  it("removes a crashed writer's orphan without adopting it or deleting unrelated files", async () => {
    const f = await fixture();
    await privateFiles.atomicWrite(f.file, "current-session");
    const orphan = `${f.file}.${randomUUID()}.tmp`;
    const unrelated = `${f.file}.not-a-uuid.tmp`;
    await fs.writeFile(unrelated, "unrelated", { mode: 0o600 });
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import fs from 'node:fs/promises';
      await fs.writeFile(process.argv[1], 'unpublished-session', {mode: 0o600, flag: 'wx'});
      process.send({ready: true}); process.on('message', () => {});
    `,
        orphan,
      ],
      { env: {}, stdio: ["ignore", "ignore", "ignore", "ipc"] }
    );
    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve())
    );
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("message", () => resolve());
        child.once("error", () => reject(new Error("Synthetic writer failed")));
      });
      child.kill("SIGKILL");
      await exited;
      await privateFiles.cleanup(f.file);
      expect(await privateFiles.read(f.file)).toBe("current-session");
      expect(await fs.readFile(unrelated, "utf8")).toBe("unrelated");
      await expect(fs.stat(orphan)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
  });

  it.each(["symlink", "hardlink", "permissive"] as const)(
    "refuses unsafe %s orphan cleanup without deleting its target",
    async (kind) => {
      const f = await fixture();
      await privateFiles.atomicWrite(f.file, "current-session");
      const orphan = `${f.file}.${randomUUID()}.tmp`;
      if (kind === "symlink") await fs.symlink(f.file, orphan);
      else if (kind === "hardlink") await fs.link(f.file, orphan);
      else await fs.writeFile(orphan, "unsafe", { mode: 0o644 });
      await expect(privateFiles.cleanup(f.file)).rejects.toMatchObject({
        code: "custody_failed",
      });
      expect(await fs.readFile(f.file, "utf8")).toBe("current-session");
      expect(await fs.lstat(orphan).then(() => true)).toBe(true);
    }
  );

  it("refuses directories owned by a different effective user", async () => {
    const f = await fixture();
    await privateFiles.directory(f.directory);
    vi.spyOn(process, "geteuid").mockReturnValue(process.geteuid!() + 1);
    await expect(privateFiles.directory(f.directory)).rejects.toMatchObject({
      code: "custody_failed",
    });
  });
});
