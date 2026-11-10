// GRIDA-SEC-004 / GRIDA-SEC-014 — exact native workspace admission and sole writer.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  WorkspaceCatalogReader,
  WorkspaceRegistry,
  type Workspace,
  type WorkspaceDirectoryIdentity,
} from "@grida/daemon/server";
import { WorkspaceMediaRegistry } from "./workspace-media-registry";

const MAX_OPERATIONS = 32;

type Options = Readonly<{
  browserData: string;
  projectsRoot: string;
  protectedPaths: readonly string[];
}>;

export class NativeWorkspaceCatalog {
  readonly directory: string;
  private readonly scopes: WorkspaceMediaRegistry;
  private readonly reader: WorkspaceCatalogReader;
  private readonly ready: Promise<void>;
  private readonly protectedPaths: readonly string[];
  private registry: WorkspaceRegistry;
  private pending: Promise<unknown> = Promise.resolve();
  private pendingCount = 0;
  private defaultCaptured = false;

  constructor(private readonly options: Options) {
    this.directory = NativeWorkspaceCatalog.directoryFor(options.browserData);
    this.protectedPaths = [
      ...options.protectedPaths,
      options.browserData,
      path.dirname(this.directory),
    ];
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

  list(): Promise<Workspace[]> {
    return this.run(async () => {
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
      const workspace = await this.mutate(() =>
        this.registry.createProject({ name })
      );
      return this.capture(workspace);
    });
  }

  pin(id: string, pinned: boolean): Promise<void> {
    return this.run(() => this.mutate(() => this.registry.pin(id, pinned)));
  }

  forget(id: string): Promise<void> {
    return this.run(() => this.mutate(() => this.registry.forget(id)));
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

  private async openRoot(
    root: string,
    priorIdentity?: WorkspaceDirectoryIdentity
  ): Promise<Workspace> {
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
    for (const directory of [path.dirname(this.directory), this.directory]) {
      await fs
        .mkdir(directory, { mode: 0o700 })
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
        });
      await assertPrivateDirectory(directory);
    }
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

async function assertPrivateDirectory(directory: string) {
  const stat = await fs.lstat(directory);
  if (
    !path.isAbsolute(directory) ||
    !stat.isDirectory() ||
    stat.uid !== process.geteuid?.() ||
    (stat.mode & 0o7777) !== 0o700 ||
    (await fs.realpath(directory)) !== directory
  )
    throw new Error("workspace_catalog_invalid");
}

function unavailable(): Error {
  return new Error("workspace_not_registered");
}
