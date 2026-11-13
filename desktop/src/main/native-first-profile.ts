// GRIDA-SEC-004 / GRIDA-SEC-005 — durable, isolated first-install ownership.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ProtectedRoots } from "@grida/daemon/server";

const DIRECTORY = "Grida Native";
const RECORD = "profile.json";
const PROMOTION = "promotion.json";
const PRIVATE_DIRECTORY = 0o700n;
const PRIVATE_FILE = 0o600n;
const OPEN_PRIVATE = fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;

export namespace NativeFirstProfile {
  type Mode = "native" | "cutover";
  export type Promotion = Readonly<{
    sourceId: string;
    scratchId: string;
    claimId: string;
  }>;
  export type Paths = Readonly<{
    root: string;
    browser: string;
    agent: string;
    media: string;
    projects: string;
    temp: string;
    mode: Mode;
  }>;

  export function controlFiles(paths: Paths): readonly string[] {
    return [path.join(paths.root, RECORD), path.join(paths.root, PROMOTION)];
  }

  export function hasPromotion(paths: Paths): boolean {
    return statIfPresent(path.join(paths.root, PROMOTION)) !== undefined;
  }

  /** Birth requires launch admission. Subsequent selection follows the record. */
  export function open(
    appData: string,
    legacy: () => ProtectedRoots,
    policy: Readonly<{
      supported: boolean;
      allowBirth: boolean;
      hasLegacyInstall?: () => boolean;
    }>
  ): Paths | undefined {
    if (!path.isAbsolute(appData)) throw invalid();
    const root = path.join(appData, DIRECTORY);
    const existing = statIfPresent(root);
    if (!existing && !policy.allowBirth) return undefined;
    const uid = process.geteuid?.();
    if (
      !policy.supported ||
      !uid ||
      fs.realpathSync.native(appData) !== appData
    )
      throw invalid();
    const parent = fs.lstatSync(appData, { bigint: true });
    if (
      !parent.isDirectory() ||
      parent.uid !== BigInt(uid) ||
      (parent.mode & 0o022n) !== 0n
    )
      throw invalid();
    if (!existing && policy.hasLegacyInstall?.()) return undefined;
    if (legacy().overlaps(root)) throw invalid();

    const paths = {
      root,
      browser: path.join(root, "browser"),
      agent: path.join(root, "agent"),
      media: path.join(root, "media"),
      projects: path.join(root, "projects"),
      temp: path.join(root, "temp"),
    };
    const user = BigInt(uid);
    const identities = () => directoryIdentities(paths, user);
    if (!existing) {
      // An interrupted or competing birth leaves an explicit unavailable
      // scope. Only the invocation that created this exact root may fill it.
      for (const directory of Object.values(paths))
        fs.mkdirSync(directory, { mode: Number(PRIVATE_DIRECTORY) });
      const bytes = profileReceipt(identities(), false);
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
    const current = identities();
    const bytes = readRecord(path.join(root, RECORD), user);
    const native = bytes.equals(profileReceipt(current, false));
    if (!native && !bytes.equals(profileReceipt(current, true)))
      throw invalid();
    const mode = native ? "native" : "cutover";
    return Object.freeze({ ...paths, mode });
  }

  /** Called while the exact drained writer claim remains locked for retirement. */
  export function beginPromotion(paths: Paths, promotion: Promotion): void {
    const { target, bytes, uid } = expectedPromotion(paths, promotion);
    if (statIfPresent(target)) {
      if (!readRecord(target, uid).equals(bytes)) throw invalid();
      return;
    }
    const temporary = path.join(paths.root, `.promotion-${randomUUID()}.tmp`);
    const descriptor = fs.openSync(
      temporary,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        OPEN_PRIVATE,
      Number(PRIVATE_FILE)
    );
    try {
      try {
        fs.writeFileSync(descriptor, bytes);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      // One managed browser owner and the matching source lease serialize
      // publication. Staging leaves no partially readable promotion record.
      fs.renameSync(temporary, target);
      syncDirectory(paths.root);
    } finally {
      if (statIfPresent(temporary)) fs.unlinkSync(temporary);
    }
  }

  export function verifyPromotion(paths: Paths, promotion: Promotion): void {
    const { target, bytes, uid } = expectedPromotion(paths, promotion);
    if (!readRecord(target, uid).equals(bytes)) throw invalid();
  }

  function expectedPromotion(paths: Paths, promotion: Promotion) {
    if (paths.mode !== "cutover" || !validPromotion(promotion)) throw invalid();
    const uid = BigInt(process.geteuid!());
    const { mode: _mode, ...directories } = paths;
    const record = readRecord(path.join(paths.root, RECORD), uid);
    if (
      !record.equals(
        profileReceipt(directoryIdentities(directories, uid), true)
      )
    )
      throw invalid();
    return {
      uid,
      target: path.join(paths.root, PROMOTION),
      bytes: Buffer.from(`${JSON.stringify({ version: 1, ...promotion })}\n`),
    };
  }

  function validPromotion({
    sourceId,
    scratchId,
    claimId,
  }: Promotion): boolean {
    const digest = /^[a-f0-9]{64}$/;
    return (
      digest.test(sourceId) &&
      digest.test(scratchId) &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(claimId)
    );
  }

  function profileReceipt(identities: string[], legacy: boolean): Buffer {
    return Buffer.from(
      `${JSON.stringify({ version: legacy ? 2 : 1, identities })}\n`
    );
  }

  function directoryIdentities(
    paths: Omit<Paths, "mode">,
    uid: bigint
  ): string[] {
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
    return identities;
  }

  function readRecord(file: string, uid: bigint): Buffer {
    const record = fs.openSync(file, fs.constants.O_RDONLY | OPEN_PRIVATE);
    try {
      const before = fs.fstatSync(record, { bigint: true });
      if (
        !before.isFile() ||
        before.uid !== uid ||
        before.nlink !== 1n ||
        (before.mode & 0o7777n) !== PRIVATE_FILE ||
        before.size < 1n ||
        before.size > 4096n
      )
        throw invalid();
      const bytes = Buffer.alloc(Number(before.size) + 1);
      const count = fs.readSync(record, bytes);
      const after = fs.fstatSync(record, { bigint: true });
      if (
        count !== Number(before.size) ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs
      )
        throw invalid();
      return bytes.subarray(0, count);
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
