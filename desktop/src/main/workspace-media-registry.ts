// GRIDA-SEC-004 / GRIDA-SEC-014 — Main-owned grants for registered workspace media.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ProtectedRoots } from "@grida/daemon/server";
import type { Workspace } from "@grida/daemon";

const MAX_GRANTS = 100;

type Identity = Readonly<{
  device: string;
  inode: string;
  birthTimeNs: string;
}>;

type Directory = Readonly<{ root: string; identity: Identity }>;

export type WorkspaceMediaGrant = Directory &
  Readonly<{ workspaceId: string; protected: readonly string[] }>;

type Registration = Readonly<{
  directory: Directory;
  openedAt: number;
}>;

export class WorkspaceMediaError extends Error {
  constructor(
    readonly status: number,
    code: string
  ) {
    super(code);
  }
}

export class WorkspaceMediaRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly denials: ProtectedRoots;

  constructor(protectedPaths: readonly string[]) {
    this.denials = new ProtectedRoots(protectedPaths);
  }

  /** Called only on a trusted Main-originated folder registration. */
  async register(
    selection: string,
    open: (root: string) => Promise<Workspace>
  ): Promise<Workspace> {
    const captured = await this.directory(selection);
    const workspace = await open(captured.root);
    const expectedId = crypto
      .createHash("sha256")
      .update(captured.root)
      .digest("hex")
      .slice(0, 16);
    if (
      workspace.id !== expectedId ||
      workspace.root !== captured.root ||
      !Number.isSafeInteger(workspace.opened_at) ||
      !sameDirectory(captured, await this.directory(captured.root))
    ) {
      throw changed();
    }
    if (
      this.registrations.size >= MAX_GRANTS &&
      !this.registrations.has(workspace.id)
    ) {
      // Bound the Main grant table with the same oldest-first retention
      // direction as the existing registration list.
      this.registrations.delete(this.registrations.keys().next().value!);
    }
    this.registrations.delete(workspace.id);
    this.registrations.set(workspace.id, {
      directory: captured,
      openedAt: workspace.opened_at,
    });
    return workspace;
  }

  async grant(
    id: string,
    lookup: () => Promise<readonly Workspace[]>
  ): Promise<WorkspaceMediaGrant> {
    const admitted = this.registrations.get(id);
    if (!admitted) {
      throw new WorkspaceMediaError(403, "workspace_media_reopen_required");
    }
    const current = (await lookup()).find((workspace) => workspace.id === id);
    if (!current) {
      this.withdraw(id, admitted);
      throw new WorkspaceMediaError(
        404,
        "workspace_media_registration_missing"
      );
    }
    try {
      if (
        current.root !== admitted.directory.root ||
        current.opened_at !== admitted.openedAt ||
        !sameDirectory(
          admitted.directory,
          await this.directory(current.root)
        ) ||
        this.registrations.get(id) !== admitted
      ) {
        throw changed();
      }
      return {
        workspaceId: id,
        ...admitted.directory,
        protected: this.denials.metadataPaths(),
      };
    } catch (error) {
      this.withdraw(id, admitted);
      throw error;
    }
  }

  private withdraw(id: string, admitted: Registration) {
    if (this.registrations.get(id) === admitted) this.registrations.delete(id);
  }

  private async directory(selection: string): Promise<Directory> {
    if (!path.isAbsolute(selection)) {
      throw new WorkspaceMediaError(403, "workspace_media_root_invalid");
    }
    try {
      const root = await fs.realpath(selection);
      const stat = await fs.lstat(root, { bigint: true });
      if (
        !stat.isDirectory() ||
        this.denials.overlaps(root) ||
        (await fs.realpath(root)) !== root
      ) {
        throw new WorkspaceMediaError(403, "workspace_media_root_denied");
      }
      return {
        root,
        identity: {
          device: stat.dev.toString(),
          inode: stat.ino.toString(),
          birthTimeNs: stat.birthtimeNs.toString(),
        },
      };
    } catch (error) {
      if (error instanceof WorkspaceMediaError) throw error;
      throw new WorkspaceMediaError(403, "workspace_media_root_unavailable");
    }
  }
}

function sameDirectory(a: Directory, b: Directory) {
  return (
    a.root === b.root &&
    a.identity.device === b.identity.device &&
    a.identity.inode === b.identity.inode &&
    a.identity.birthTimeNs === b.identity.birthTimeNs
  );
}

function changed() {
  return new WorkspaceMediaError(403, "workspace_media_registration_changed");
}
