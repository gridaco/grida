// GRIDA-SEC-004 / GRIDA-SEC-005 — durable, isolated first-install ownership.
import fs from "node:fs";
import path from "node:path";
import type { ProtectedRoots } from "@grida/daemon/server";

const DIRECTORY = "Grida Native";
const RECORD = "profile.json";
const PRIVATE_DIRECTORY = 0o700n;
const PRIVATE_FILE = 0o600n;
const OPEN_PRIVATE = fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;

export namespace NativeFirstProfile {
  export type Paths = Readonly<{
    root: string;
    browser: string;
    agent: string;
    media: string;
    projects: string;
    temp: string;
  }>;

  /** The build grants birth only. Subsequent selection follows the record. */
  export function open(
    appData: string,
    legacy: () => ProtectedRoots,
    policy: Readonly<{ supported: boolean; allowBirth: boolean }>
  ): Paths | undefined {
    if (!path.isAbsolute(appData)) throw invalid();
    const root = path.join(appData, DIRECTORY);
    const existing = statIfPresent(root);
    if (!existing && !policy.allowBirth) return undefined;
    const uid = process.geteuid?.();
    if (
      !policy.supported ||
      !uid ||
      fs.realpathSync.native(appData) !== appData ||
      legacy().overlaps(root)
    )
      throw invalid();
    const parent = fs.lstatSync(appData, { bigint: true });
    if (
      !parent.isDirectory() ||
      parent.uid !== BigInt(uid) ||
      (parent.mode & 0o022n) !== 0n
    )
      throw invalid();

    const paths = Object.freeze({
      root,
      browser: path.join(root, "browser"),
      agent: path.join(root, "agent"),
      media: path.join(root, "media"),
      projects: path.join(root, "projects"),
      temp: path.join(root, "temp"),
    });
    if (!existing) {
      // An interrupted or competing birth leaves an explicit unavailable
      // scope. Only the invocation that created this exact root may fill it.
      for (const directory of Object.values(paths))
        fs.mkdirSync(directory, { mode: Number(PRIVATE_DIRECTORY) });
      const bytes = receipt(paths, BigInt(uid));
      const record = fs.openSync(
        path.join(root, RECORD),
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          OPEN_PRIVATE,
        Number(PRIVATE_FILE)
      );
      try {
        fs.writeFileSync(record, bytes);
        fs.fsyncSync(record);
      } finally {
        fs.closeSync(record);
      }
      syncDirectory(root);
      syncDirectory(appData);
    }
    verifyRecord(paths, BigInt(uid));
    return paths;
  }

  function receipt(paths: Paths, uid: bigint): Buffer {
    const identities = Object.values(paths).map((directory) => {
      const stat = fs.lstatSync(directory, { bigint: true });
      if (
        !stat.isDirectory() ||
        stat.uid !== uid ||
        (stat.mode & 0o7777n) !== PRIVATE_DIRECTORY ||
        fs.realpathSync.native(directory) !== directory
      )
        throw invalid();
      return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
    });
    if (new Set(identities).size !== identities.length) throw invalid();
    return Buffer.from(`${JSON.stringify({ version: 1, identities })}\n`);
  }

  function verifyRecord(paths: Paths, uid: bigint): void {
    const expected = receipt(paths, uid);
    const record = fs.openSync(
      path.join(paths.root, RECORD),
      fs.constants.O_RDONLY | OPEN_PRIVATE
    );
    try {
      const before = fs.fstatSync(record, { bigint: true });
      if (
        !before.isFile() ||
        before.uid !== uid ||
        before.nlink !== 1n ||
        (before.mode & 0o7777n) !== PRIVATE_FILE ||
        before.size !== BigInt(expected.byteLength)
      )
        throw invalid();
      const bytes = Buffer.alloc(expected.byteLength + 1);
      const count = fs.readSync(record, bytes);
      const after = fs.fstatSync(record, { bigint: true });
      if (
        count !== expected.byteLength ||
        !bytes.subarray(0, count).equals(expected) ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs
      )
        throw invalid();
    } finally {
      fs.closeSync(record);
    }
  }

  function statIfPresent(target: string): fs.Stats | undefined {
    try {
      return fs.lstatSync(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  function syncDirectory(directory: string): void {
    const descriptor = fs.openSync(
      directory,
      fs.constants.O_RDONLY | OPEN_PRIVATE
    );
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }

  function invalid() {
    return new Error("native_first_profile_invalid");
  }
}
