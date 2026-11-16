// GRIDA-SEC-004 — Main captures original image sources; renderer paths are never trusted.
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ProtectedRoots } from "@grida/daemon/server";

type Record = Readonly<{
  version: 1;
  sessionId: string;
  inputId: string;
  descriptor: NativeSelectedImages.Descriptor;
  inputPath?: string;
}>;

/** Durable first-capture identity, separate from Rust-owned accepted input storage. */
export class NativeSelectedImages {
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly snapshots: string;

  constructor(
    private readonly directory: string,
    private readonly protectedPaths: readonly string[]
  ) {
    this.snapshots = path.join(directory, "snapshots");
  }

  capture(
    sessionId: string,
    inputId: string,
    source: NativeSelectedImages.Source
  ): Promise<NativeSelectedImages.Descriptor> {
    const key = this.key(sessionId, inputId);
    return this.serial(key, async () => {
      await privateDirectory(this.directory);
      const name = validName(source.name);
      const disk = typeof source.path === "string";
      const snapshot = source.bytes instanceof ArrayBuffer;
      if (
        disk === snapshot ||
        (source.path !== undefined && !disk) ||
        (source.bytes !== undefined && !snapshot)
      )
        throw unavailable();
      const original = snapshot
        ? new Uint8Array(source.bytes as ArrayBuffer)
        : undefined;
      if (
        original &&
        (!original.length || original.length > NativeSelectedImages.maxBytes)
      )
        throw new Error("selected_image_size_limit");
      const bytes = original ? Buffer.from(original) : undefined;
      const expected =
        disk || source.sha256 !== undefined ? selectedFacts(source) : undefined;
      if (
        bytes &&
        expected &&
        (bytes.length !== expected.size || digest(bytes) !== expected.sha256)
      )
        throw new Error("selected_image_changed");
      const previous = await this.load(key, sessionId, inputId);
      if (previous) {
        const same =
          previous.descriptor.name === name &&
          (disk
            ? previous.descriptor.source === "disk" &&
              previous.inputPath === source.path &&
              Buffer.from(previous.descriptor.sha256).toString("hex") ===
                expected!.sha256
            : digest(bytes!) ===
              Buffer.from(previous.descriptor.sha256).toString("hex"));
        if (!same)
          throw new Error("native_chat_selected_image_identity_reused");
        return previous.descriptor;
      }
      if (
        (await fs.readdir(this.directory)).filter((name) =>
          /^[a-f0-9]{64}\.json$/.test(name)
        ).length >= 128
      )
        throw new Error("native_chat_selected_image_busy");
      let descriptor: NativeSelectedImages.Descriptor;
      if (disk)
        descriptor = await this.disk(source.path as string, name, expected!);
      else {
        await privateDirectory(this.snapshots);
        const file = path.join(
          await fs.realpath(this.snapshots),
          `${randomUUID()}.image`
        );
        const handle = await fs.open(
          file,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600
        );
        try {
          await handle.writeFile(bytes!);
          await handle.sync();
        } finally {
          await handle.close();
        }
        descriptor = Object.freeze({
          path: file,
          sha256: Object.freeze([
            ...createHash("sha256").update(bytes!).digest(),
          ]),
          name,
          source: "snapshot",
        });
      }
      const record: Record = Object.freeze({
        version: 1,
        sessionId,
        inputId,
        descriptor,
        ...(disk && { inputPath: source.path as string }),
      });
      const file = path.join(this.directory, `${key}.json`);
      const temporary = path.join(
        this.directory,
        `${key}-${randomUUID()}.pending`
      );
      try {
        const handle = await fs.open(
          temporary,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600
        );
        try {
          await handle.writeFile(JSON.stringify(record));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temporary, file);
      } catch (error) {
        // Nothing has reached native admission before this durable descriptor.
        if (descriptor.source === "snapshot")
          await fs.unlink(descriptor.path).catch(() => {});
        await fs.unlink(temporary).catch(() => {});
        throw error;
      }
      return descriptor;
    });
  }

  /** Call only after a verified acceptance or an explicit pre-admission refusal. */
  complete(sessionId: string, inputId: string): Promise<void> {
    const key = this.key(sessionId, inputId);
    return this.serial(key, async () => {
      await privateDirectory(this.directory);
      const record = await this.load(key, sessionId, inputId);
      if (!record) return;
      if (record.descriptor.source === "snapshot") {
        const root = await fs.realpath(this.snapshots);
        if (
          path.dirname(record.descriptor.path) !== root ||
          !/^[a-f0-9-]{36}\.image$/.test(path.basename(record.descriptor.path))
        )
          throw unavailable();
        await fs
          .unlink(record.descriptor.path)
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
      }
      await fs.unlink(path.join(this.directory, `${key}.json`));
    });
  }

  private async disk(
    value: string,
    name: string,
    expected: ReturnType<typeof selectedFacts>
  ): Promise<NativeSelectedImages.Descriptor> {
    if (
      !path.isAbsolute(value) ||
      Buffer.byteLength(value) > 4096 ||
      /\p{Cc}/u.test(value)
    )
      throw unavailable();
    const real = await fs.realpath(value);
    if (real !== path.resolve(value)) throw new Error("selected_image_symlink");
    if (path.basename(real) !== name) throw unavailable();
    const home = process.env.GRIDA_HOME;
    const denied = new ProtectedRoots([
      ...this.protectedPaths,
      path.join(os.homedir(), ".grida"),
      ...(home && path.isAbsolute(home) ? [home] : []),
    ]);
    if (denied.overlaps(real)) throw new Error("selected_image_protected");
    const handle = await fs.open(
      real,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.nlink !== 1n) throw unavailable();
      if (
        before.size <= 0n ||
        before.size > BigInt(NativeSelectedImages.maxBytes)
      )
        throw new Error("selected_image_size_limit");
      if (
        Number(before.size) !== expected.size ||
        Number(before.mtimeNs / 1_000_000n) !== expected.lastModified
      )
        throw new Error("selected_image_changed");
      const hash = createHash("sha256");
      const buffer = Buffer.alloc(64 * 1024);
      let count = 0;
      for (;;) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(buffer.length, NativeSelectedImages.maxBytes + 1 - count),
          null
        );
        if (!bytesRead) break;
        count += bytesRead;
        if (count > NativeSelectedImages.maxBytes)
          throw new Error("selected_image_size_limit");
        hash.update(buffer.subarray(0, bytesRead));
      }
      const after = await handle.stat({ bigint: true });
      const current = await fs.lstat(real, { bigint: true });
      if (
        count !== Number(before.size) ||
        !sameFile(before, after) ||
        !sameFile(after, current) ||
        (await fs.realpath(value)) !== real
      )
        throw new Error("selected_image_changed");
      const sha256 = hash.digest();
      if (sha256.toString("hex") !== expected.sha256)
        throw new Error("selected_image_changed");
      return Object.freeze({
        path: real,
        sha256: Object.freeze([...sha256]),
        name,
        source: "disk",
      });
    } finally {
      await handle.close();
    }
  }

  private async load(
    key: string,
    sessionId: string,
    inputId: string
  ): Promise<Record | null> {
    let handle;
    try {
      handle = await fs.open(
        path.join(this.directory, `${key}.json`),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw unavailable();
    }
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size > 8192 ||
        !owned(stat)
      )
        throw unavailable();
      const buffer = Buffer.alloc(8193);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== stat.size) throw unavailable();
      const record = JSON.parse(
        buffer.toString("utf8", 0, bytesRead)
      ) as Record;
      const d = record.descriptor;
      if (
        record.version !== 1 ||
        record.sessionId !== sessionId ||
        record.inputId !== inputId ||
        !d ||
        !path.isAbsolute(d.path) ||
        validName(d.name) !== d.name ||
        !Array.isArray(d.sha256) ||
        d.sha256.length !== 32 ||
        !d.sha256.every(
          (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255
        ) ||
        (d.source !== "disk" && d.source !== "snapshot") ||
        (d.source === "disk" && typeof record.inputPath !== "string")
      )
        throw unavailable();
      return record;
    } catch {
      throw unavailable();
    } finally {
      await handle.close();
    }
  }

  private key(sessionId: string, inputId: string): string {
    return digest(Buffer.from(JSON.stringify([sessionId, inputId])));
  }
  private serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const result = (this.operations.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    this.operations.set(key, result);
    void result
      .finally(() => {
        if (this.operations.get(key) === result) this.operations.delete(key);
      })
      .catch(() => {});
    return result;
  }
}

export namespace NativeSelectedImages {
  export const capability = "co.grida/session/selected-image";
  export const maxBytes = 20 * 1024 * 1024;
  export type Descriptor = Readonly<{
    path: string;
    sha256: readonly number[];
    name: string;
    source: "disk" | "snapshot";
  }>;
  export type Source = Readonly<{
    name: unknown;
    path?: unknown;
    bytes?: unknown;
    sha256?: unknown;
    size?: unknown;
    lastModified?: unknown;
  }>;
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function selectedFacts(source: NativeSelectedImages.Source): {
  sha256: string;
  size: number;
  lastModified: number;
} {
  const { sha256, size, lastModified } = source;
  if (
    !Array.isArray(sha256) ||
    sha256.length !== 32 ||
    !sha256.every(
      (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255
    ) ||
    !Number.isSafeInteger(size) ||
    (size as number) <= 0 ||
    (size as number) > NativeSelectedImages.maxBytes ||
    !Number.isSafeInteger(lastModified)
  )
    throw unavailable();
  return {
    sha256: Buffer.from(sha256).toString("hex"),
    size: size as number,
    lastModified: lastModified as number,
  };
}
function validName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    Buffer.byteLength(value) > 256 ||
    /[\\/\p{Cc}]/u.test(value)
  )
    throw unavailable();
  return value;
}
function unavailable(): Error {
  return new Error("native_chat_selected_image_unavailable");
}
function owned(stat: { uid: number; mode: number }): boolean {
  return (
    process.platform === "win32" ||
    (stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0)
  );
}
async function privateDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !owned(stat))
    throw unavailable();
}
function sameFile(
  a: {
    dev: bigint;
    ino: bigint;
    size: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
  },
  b: typeof a
): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}
