// GRIDA-SEC-004 / GRIDA-SEC-014 — read-only scope lookup for a Main-owned catalog.
import crypto from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { ProtectedRoots } from "../protected-roots";
import type { Workspace } from "../workspaces";
import {
  directoryIdentity,
  sameDirectoryIdentity,
  type WorkspaceDirectoryIdentity,
} from "./directory-identity";

const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_ENTRIES = 100;
type BoundWorkspace = Readonly<{
  workspace: Workspace;
  identity: WorkspaceDirectoryIdentity;
}>;

export class WorkspaceCatalogReader {
  private readonly denials: ProtectedRoots;

  constructor(
    private readonly directory: string,
    protectedPaths: readonly string[]
  ) {
    this.denials = new ProtectedRoots([...protectedPaths, directory]);
  }

  async findById(id: string): Promise<Workspace | null> {
    return (await this.resolve(id))?.workspace ?? null;
  }

  async resolve(id: string): Promise<BoundWorkspace | null> {
    if (!/^[a-f0-9]{16}$/.test(id)) return null;
    const bound = (await this.snapshot()).find(
      (entry) => entry.workspace.id === id
    );
    if (!bound || this.denials.overlaps(bound.workspace.root)) return null;
    const { root } = bound.workspace;
    try {
      const stat = await fs.lstat(root, { bigint: true });
      return stat.isDirectory() &&
        sameDirectoryIdentity(bound.identity, directoryIdentity(stat)) &&
        (await fs.realpath(root)) === root
        ? bound
        : null;
    } catch {
      return null;
    }
  }

  async verify(): Promise<void> {
    await this.snapshot();
  }

  /** Load each committed view afresh so forget takes effect on the next lookup. */
  private async snapshot(): Promise<BoundWorkspace[]> {
    try {
      const dir = await fs.lstat(this.directory);
      if (
        !dir.isDirectory() ||
        dir.uid !== process.geteuid?.() ||
        (dir.mode & 0o7777) !== 0o700 ||
        (await fs.realpath(this.directory)) !== this.directory
      )
        throw invalid();
      const file = await fs
        .open(
          path.join(this.directory, "workspaces.json"),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
        )
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
      if (!file) return [];
      try {
        const stat = await file.stat();
        if (
          !stat.isFile() ||
          stat.uid !== dir.uid ||
          stat.nlink > 1 ||
          (stat.mode & 0o7777) !== 0o600 ||
          stat.size > MAX_CATALOG_BYTES
        )
          throw invalid();
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
        if (length !== stat.size) throw invalid();
        return entries(JSON.parse(bytes.subarray(0, length).toString("utf8")));
      } finally {
        await file.close();
      }
    } catch {
      throw invalid();
    }
  }
}

function entries(value: unknown): BoundWorkspace[] {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) throw invalid();
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw invalid();
    const { id, root, name, opened_at, pinned, directory_identity } = entry;
    if (
      typeof root !== "string" ||
      !path.isAbsolute(root) ||
      Buffer.byteLength(root) > 4096 ||
      typeof name !== "string" ||
      !name ||
      Buffer.byteLength(name) > 4096 ||
      typeof pinned !== "boolean" ||
      !Number.isSafeInteger(opened_at) ||
      opened_at < 0 ||
      id !==
        crypto.createHash("sha256").update(root).digest("hex").slice(0, 16) ||
      ids.has(id) ||
      !validIdentity(directory_identity)
    )
      throw invalid();
    ids.add(id);
    return {
      workspace: { id, root, name, opened_at, pinned },
      identity: {
        device: directory_identity.device,
        inode: directory_identity.inode,
        birthTimeNs: directory_identity.birthTimeNs,
      },
    };
  });
}

function validIdentity(value: unknown): value is WorkspaceDirectoryIdentity {
  if (!value || typeof value !== "object") return false;
  return (["device", "inode", "birthTimeNs"] as const).every((key) => {
    const part = (value as Record<string, unknown>)[key];
    return typeof part === "string" && /^-?\d{1,24}$/.test(part);
  });
}

function invalid(): Error {
  return new Error("workspace_catalog_invalid");
}
