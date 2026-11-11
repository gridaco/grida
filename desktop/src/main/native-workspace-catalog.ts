// GRIDA-SEC-004 / GRIDA-SEC-014 — exact native workspace admission and sole writer.
import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ProtectedRoots,
  WorkspaceCatalogReader,
  WorkspaceRegistry,
  type Workspace,
  type WorkspaceDirectoryIdentity,
} from "@grida/daemon/server";
import type { NativeExternalRuns } from "./native-external-runs";
import {
  WorkspaceMediaRegistry,
  type WorkspaceMediaGrant,
} from "./workspace-media-registry";
import { WorkspaceWriteUnverified } from "./workspace-file-worker";

const MAX_OPERATIONS = 32;

type Options = Readonly<{
  browserData: string;
  projectsRoot: string;
  protectedPaths: readonly string[];
}>;

export type NativeNestedDeckGrant = WorkspaceMediaGrant &
  Readonly<{
    parentWorkspaceId: string;
    parentIdentity: WorkspaceDirectoryIdentity;
  }>;

type ExternalAccess = Readonly<{
  privateDirectory: string;
  temporaryDirectory: string;
  workspace(id: string): Promise<WorkspaceMediaGrant>;
}>;
type ExternalOwner = Pick<NativeExternalRuns, "selection" | "close">;

export class NativeWorkspaceCatalog {
  readonly directory: string;
  private readonly scopes: WorkspaceMediaRegistry;
  private readonly reader: WorkspaceCatalogReader;
  private readonly ready: Promise<void>;
  private readonly protectedPaths: readonly string[];
  private readonly ordinaryDenials: ProtectedRoots;
  private readonly externalScratch: string;
  private external?: ExternalOwner;
  private openingExternal = false;
  private registry: WorkspaceRegistry;
  private pending: Promise<unknown> = Promise.resolve();
  private pendingCount = 0;
  private defaultCaptured = false;
  private readonly undrainedWrites = new Set<Promise<unknown>>();

  constructor(private readonly options: Options) {
    this.directory = NativeWorkspaceCatalog.directoryFor(options.browserData);
    const ordinaryPaths = [
      ...options.protectedPaths,
      options.browserData,
      path.dirname(this.directory),
    ];
    this.ordinaryDenials = new ProtectedRoots(ordinaryPaths);
    this.externalScratch = path.join(
      path.dirname(options.browserData),
      ".grida-external-scratch"
    );
    this.protectedPaths = [...ordinaryPaths, this.externalScratch];
    this.scopes = new WorkspaceMediaRegistry(this.protectedPaths);
    this.reader = new WorkspaceCatalogReader(
      this.directory,
      this.protectedPaths
    );
    this.registry = this.newRegistry();
    this.ready = this.prepare();
    void this.ready.catch(() => {});
  }

  private static directoryFor(browserData: string): string {
    return path.join(
      path.dirname(browserData),
      "workspace-catalog",
      createHash("sha256").update(browserData).digest("hex")
    );
  }

  async initialize(): Promise<void> {
    await this.ready;
  }

  fileProtectionPaths(): readonly string[] {
    return this.protectedPaths;
  }

  async openExternalRuns<T extends ExternalOwner>(
    open: (access: ExternalAccess) => Promise<T>
  ): Promise<T> {
    if (this.external || this.openingExternal) throw externalUnavailable();
    this.openingExternal = true;
    try {
      const access = await this.run(async () => {
        await assertPrivateDirectory(path.dirname(this.options.browserData));
        const temporaryDirectory = this.externalScratch;
        if (this.ordinaryDenials.overlaps(temporaryDirectory))
          throw externalUnavailable();
        const scratch = await ensurePrivateDirectory(temporaryDirectory);
        await this.verifyExternalScratch(scratch);
        const privateDirectory = path.join(
          this.options.browserData,
          "native-external"
        );
        await ensurePrivateDirectory(privateDirectory);
        return {
          privateDirectory,
          temporaryDirectory,
          workspace: (id: string) =>
            this.run(async () => {
              await this.verifyExternalScratch(scratch);
              const grant = await this.resolveFileGrant(id);
              return {
                ...grant,
                // The catalog still denies the container. Rust receives only
                // a fresh per-run child of this dedicated scratch root.
                protected: this.ordinaryDenials.metadataPaths(),
              };
            }),
        };
      });
      const owner = await open(access);
      this.external = owner;
      return owner;
    } finally {
      this.openingExternal = false;
    }
  }

  private async verifyExternalScratch(expected: BigIntStats): Promise<void> {
    const scratch = await assertPrivateDirectory(this.externalScratch);
    if (
      this.ordinaryDenials.overlaps(this.externalScratch) ||
      !sameDirectory(expected, scratch)
    )
      throw externalUnavailable();
    const protectedDirectories = await Promise.all(
      this.ordinaryDenials.canonicalPaths().map(directoryIfPresent)
    );
    if (
      protectedDirectories.some(
        (other) => other && sameDirectory(other, scratch)
      )
    )
      throw externalUnavailable();
  }

  list(): Promise<Workspace[]> {
    return this.run(async () => {
      this.requireDrainedWrites();
      const defaultWorkspace = await this.registry.ensureDefault();
      if (defaultWorkspace && !this.defaultCaptured) {
        await this.capture(defaultWorkspace);
        this.defaultCaptured = true;
      }
      return this.registry.list();
    });
  }

  /** A selected folder comes from Main's own picker or OS open event. */
  openSelected(root: string): Promise<Workspace> {
    return this.run(() => this.openRoot(root));
  }

  reopen(root: string): Promise<Workspace> {
    return this.run(async () => {
      const entry = await this.registry.findByRoot(root);
      const bound = entry && (await this.reader.resolve(entry.id));
      if (!bound) throw unavailable();
      return this.openRoot(bound.workspace.root, bound.identity);
    });
  }

  create(name?: string): Promise<Workspace> {
    return this.run(async () => {
      this.requireDrainedWrites();
      const workspace = await this.mutate(() =>
        this.registry.createProject({ name })
      );
      return this.capture(workspace);
    });
  }

  pin(id: string, pinned: boolean): Promise<void> {
    return this.run(() => this.mutate(() => this.registry.pin(id, pinned)));
  }

  async forget(id: string): Promise<void> {
    // Drain before joining the catalog queue. An admitted start may be
    // completing its last exact grant check through that same queue.
    if (this.external?.selection.workspaceId === id)
      await this.external.close();
    return await this.run(() => {
      this.requireDrainedWrites();
      return this.mutate(() => this.registry.forget(id));
    });
  }

  find(id: string): Promise<Workspace | null> {
    return this.run(() => this.reader.findById(id));
  }

  grant(id: string) {
    return this.run(() =>
      this.scopes.grant(id, async () => {
        const workspace = await this.registry.findById(id);
        return workspace ? [workspace] : [];
      })
    );
  }

  /** Buffered reads may use the exact committed directory across restarts. */
  fileGrant(id: string) {
    return this.run(() => this.resolveFileGrant(id));
  }

  /** Resolve a root deck through the committed native workspace catalog. */
  rootDeck(id: string): Promise<WorkspaceMediaGrant> {
    return this.run(async () =>
      NativeDeckGrant.root(await this.resolveFileGrant(id))
    );
  }

  /** Resolve a nested bundle without granting the workspace which contains it. */
  nestedDeck(id: string, relativePath: string): Promise<NativeNestedDeckGrant> {
    return this.run(async () =>
      NativeDeckGrant.nested(await this.resolveFileGrant(id), relativePath)
    );
  }

  /** Hold catalog publication until the admitted writer has settled. */
  withWriteGrant<T>(
    id: string,
    write: (grant: WorkspaceMediaGrant) => Promise<T>
  ): Promise<T> {
    return this.run(async () => {
      this.requireDrainedWrites();
      const grant = await this.resolveFileGrant(id);
      try {
        return await write(grant);
      } catch (error) {
        if (error instanceof WorkspaceWriteUnverified && error.exited) {
          const exited = error.exited;
          this.undrainedWrites.add(exited);
          void exited.then(() => this.undrainedWrites.delete(exited));
        }
        throw error;
      }
    });
  }

  private async resolveFileGrant(id: string): Promise<WorkspaceMediaGrant> {
    const bound = await this.reader.resolve(id);
    if (!bound) throw unavailable();
    return {
      workspaceId: bound.workspace.id,
      root: bound.workspace.root,
      identity: bound.identity,
      protected: this.scopes.protectedMetadataPaths(),
    };
  }

  private requireDrainedWrites(): void {
    if (this.undrainedWrites.size)
      throw new Error("workspace_write_unverified");
  }

  private async openRoot(
    root: string,
    priorIdentity?: WorkspaceDirectoryIdentity
  ): Promise<Workspace> {
    this.requireDrainedWrites();
    return this.scopes.register(root, async (canonical, identity) => {
      const workspace = await this.mutate(() =>
        this.registry.open(canonical, priorIdentity ?? identity)
      );
      if (!(await this.reader.findById(workspace.id))) throw unavailable();
      return workspace;
    });
  }

  private async capture(workspace: Workspace): Promise<Workspace> {
    return this.scopes.register(workspace.root, async () => {
      if (!(await this.reader.findById(workspace.id))) throw unavailable();
      return workspace;
    });
  }

  private newRegistry(): WorkspaceRegistry {
    return new WorkspaceRegistry(
      this.directory,
      this.options.projectsRoot,
      this.protectedPaths,
      { captureDirectoryIdentity: true }
    );
  }

  private async prepare() {
    await assertPrivateDirectory(this.options.browserData);
    for (const directory of [path.dirname(this.directory), this.directory])
      await ensurePrivateDirectory(directory);
    await this.reader.verify();
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pendingCount >= MAX_OPERATIONS)
      return Promise.reject(new Error("workspace_catalog_busy"));
    this.pendingCount++;
    const result = this.pending
      .then(async () => {
        await this.ready;
        return await operation();
      })
      .finally(() => {
        this.pendingCount--;
      });
    this.pending = result.catch(() => {});
    return result;
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Restore the registry's in-memory state from its committed file.
      this.registry = this.newRegistry();
      throw error;
    }
  }
}

/** Validate deck scopes from an already admitted Main-owned workspace grant. */
export namespace NativeDeckGrant {
  export async function root(
    grant: WorkspaceMediaGrant
  ): Promise<WorkspaceMediaGrant> {
    await requireDeck(
      grant.root,
      grant.identity,
      path.extname(grant.root).toLowerCase() === ".canvas"
    );
    return grant;
  }

  export async function nested(
    parent: WorkspaceMediaGrant,
    relativePath: string
  ): Promise<NativeNestedDeckGrant> {
    if (
      Buffer.byteLength(relativePath) > 4096 ||
      relativePath.includes("\0") ||
      /[\\\uD800-\uDFFF]/u.test(relativePath) ||
      relativePath
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      !relativePath.toLowerCase().endsWith(".canvas")
    )
      throw unavailable();
    const root = path.join(parent.root, relativePath);
    if (new ProtectedRoots(parent.protected).overlaps(root))
      throw unavailable();
    const metadata = await fs.lstat(root, { bigint: true }).catch(() => {
      throw unavailable();
    });
    const identity = {
      device: String(metadata.dev),
      inode: String(metadata.ino),
      birthTimeNs: String(metadata.birthtimeNs),
    };
    if (
      !metadata.isDirectory() ||
      identity.device !== parent.identity.device ||
      identity.birthTimeNs === "0"
    )
      throw unavailable();
    await requireDeck(root, identity, true);
    const checked = await fs.lstat(parent.root, { bigint: true });
    if (!checked.isDirectory() || !matchesIdentity(checked, parent.identity))
      throw unavailable();
    const digest = createHash("sha256")
      .update(
        JSON.stringify([
          parent.workspaceId,
          parent.identity,
          relativePath,
          identity,
        ])
      )
      .digest("hex");
    return {
      workspaceId: `deck-${digest}`,
      parentWorkspaceId: parent.workspaceId,
      parentIdentity: parent.identity,
      root,
      identity,
      protected: parent.protected,
    };
  }
}

function matchesIdentity(
  metadata: BigIntStats,
  identity: WorkspaceDirectoryIdentity
): boolean {
  return (
    String(metadata.dev) === identity.device &&
    String(metadata.ino) === identity.inode &&
    String(metadata.birthtimeNs) === identity.birthTimeNs
  );
}

async function requireDeck(
  rootPath: string,
  identity: WorkspaceDirectoryIdentity,
  implicit: boolean
) {
  const marker = await fs
    .lstat(path.join(rootPath, ".canvas.json"), { bigint: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
  const root = await fs.lstat(rootPath, { bigint: true });
  if (
    !root.isDirectory() ||
    !matchesIdentity(root, identity) ||
    (await fs.realpath(rootPath)) !== rootPath ||
    (marker
      ? !marker.isFile() || marker.nlink !== 1n || marker.dev !== root.dev
      : !implicit)
  )
    throw unavailable();
}

async function assertPrivateDirectory(directory: string) {
  const stat = await fs.lstat(directory, { bigint: true });
  if (
    !path.isAbsolute(directory) ||
    !stat.isDirectory() ||
    stat.uid !== BigInt(process.geteuid?.() ?? -1) ||
    (stat.mode & 0o7777n) !== 0o700n ||
    (await fs.realpath(directory)) !== directory
  )
    throw new Error("workspace_catalog_invalid");
  return stat;
}

async function ensurePrivateDirectory(directory: string) {
  await fs
    .mkdir(directory, { mode: 0o700 })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  return assertPrivateDirectory(directory);
}

async function directoryIfPresent(location: string) {
  try {
    return await fs.stat(location, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

function sameDirectory(first: BigIntStats, second: BigIntStats) {
  return (
    first.dev === second.dev &&
    first.ino === second.ino &&
    first.birthtimeNs === second.birthtimeNs
  );
}

function externalUnavailable() {
  return new Error("native_external_workspace_scope_unavailable");
}

function unavailable(): Error {
  return new Error("workspace_not_registered");
}
