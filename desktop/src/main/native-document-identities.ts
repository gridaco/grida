// GRIDA-SEC-004 / GRIDA-SEC-014 — durable identity for one Main-selected document.
import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { DocumentFileGrant } from "./workspace-file-worker";

const MAX_RECEIPT_BYTES = 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,19})$/;

type FileIdentity = DocumentFileGrant["identity"];
type Receipt = Readonly<{
  version: 1;
  pathDigest: string;
  key: string;
  file: FileIdentity;
  parent: FileIdentity;
}>;

/** The file owner is the sole writer and serializes operations per selection. */
export class NativeDocumentIdentities {
  constructor(private readonly directory: string) {}

  async resolve(grant: DocumentFileGrant): Promise<string> {
    const previous = await this.read(grant.path);
    if (previous && matches(previous, grant)) return previous.key;
    const key = randomUUID();
    await this.publish(grant, key);
    return key;
  }

  async advance(
    previous: DocumentFileGrant,
    saved: DocumentFileGrant
  ): Promise<void> {
    if (
      previous.path !== saved.path ||
      !sameIdentity(previous.parentIdentity, saved.parentIdentity)
    )
      throw unavailable();
    const receipt = await this.read(previous.path);
    if (receipt && matches(receipt, previous)) {
      await this.publish(saved, receipt.key);
    }
  }

  private filename(document: string): string {
    return path.join(this.directory, `${digest(document)}.json`);
  }

  private async read(document: string): Promise<Receipt | null> {
    const directory = await this.directoryMetadata();
    if (!directory) return null;
    const file = await fs
      .open(
        this.filename(document),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
    if (!file) return null;
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.uid !== process.geteuid?.() ||
        (stat.mode & 0o7777) !== 0o600 ||
        stat.nlink !== 1 ||
        stat.size < 1 ||
        stat.size > MAX_RECEIPT_BYTES
      )
        throw unavailable();
      const bytes = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          length,
          bytes.length - length,
          length
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length !== stat.size) throw unavailable();
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, length)
        )
      );
      if (!validReceipt(value) || value.pathDigest !== digest(document))
        throw unavailable();
      await this.requireSameDirectory(directory);
      return value;
    } finally {
      await file.close();
    }
  }

  private async publish(grant: DocumentFileGrant, key: string): Promise<void> {
    const value: Receipt = {
      version: 1,
      pathDigest: digest(grant.path),
      key,
      file: grant.identity,
      parent: grant.parentIdentity,
    };
    if (!validReceipt(value)) throw unavailable();
    let directory = await this.directoryMetadata();
    if (!directory) {
      const parent = path.dirname(this.directory);
      await requirePrivateDirectory(parent);
      try {
        await fs.mkdir(this.directory, { mode: 0o700 });
        await syncDirectory(parent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      directory = await this.directoryMetadata();
      if (!directory) throw unavailable();
    }
    const pending = path.join(this.directory, `.${randomUUID()}.pending`);
    const file = await fs.open(pending, "wx", 0o600);
    let published = false;
    try {
      try {
        await file.writeFile(JSON.stringify(value));
        await file.sync();
      } finally {
        await file.close();
      }
      await this.requireSameDirectory(directory);
      await fs.rename(pending, this.filename(grant.path));
      published = true;
      await syncDirectory(this.directory);
    } finally {
      if (!published) await fs.unlink(pending).catch(() => {});
    }
  }

  private async directoryMetadata(): Promise<BigIntStats | null> {
    const stat = await fs
      .lstat(this.directory, { bigint: true })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
    if (stat) await requirePrivateDirectory(this.directory, stat);
    return stat;
  }

  private async requireSameDirectory(original: BigIntStats): Promise<void> {
    const current = await this.directoryMetadata();
    if (
      !current ||
      original.dev !== current.dev ||
      original.ino !== current.ino ||
      original.birthtimeNs !== current.birthtimeNs
    )
      throw unavailable();
  }
}

function validReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<Receipt>;
  return (
    Object.keys(value).length === 5 &&
    receipt.version === 1 &&
    typeof receipt.pathDigest === "string" &&
    /^[0-9a-f]{64}$/.test(receipt.pathDigest) &&
    typeof receipt.key === "string" &&
    UUID.test(receipt.key) &&
    validIdentity(receipt.file) &&
    validIdentity(receipt.parent)
  );
}

function validIdentity(value: unknown): value is FileIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<FileIdentity>;
  return (
    Object.keys(value).length === 3 &&
    identity.birthTimeNs !== "0" &&
    [identity.device, identity.inode, identity.birthTimeNs].every(
      (part) => typeof part === "string" && DECIMAL.test(part)
    )
  );
}

function digest(document: string): string {
  return createHash("sha256").update(document).digest("hex");
}

async function requirePrivateDirectory(
  directory: string,
  metadata?: BigIntStats
): Promise<void> {
  const stat = metadata ?? (await fs.lstat(directory, { bigint: true }));
  if (
    !stat.isDirectory() ||
    stat.uid !== BigInt(process.geteuid?.() ?? -1) ||
    (stat.mode & 0o7777n) !== 0o700n ||
    (await fs.realpath(directory)) !== directory
  )
    throw unavailable();
}

function matches(receipt: Receipt, grant: DocumentFileGrant): boolean {
  return (
    sameIdentity(receipt.file, grant.identity) &&
    sameIdentity(receipt.parent, grant.parentIdentity)
  );
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.birthTimeNs === right.birthTimeNs
  );
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function unavailable(): Error {
  return new Error("native_document_identity_unavailable");
}
