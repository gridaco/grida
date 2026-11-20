// GRIDA-SEC-004 / GRIDA-SEC-014 — Settings owns opaque metadata-only archive handles.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DesktopArchivedChatPage } from "@grida/desktop-bridge";
import type { Workspace } from "@grida/daemon/server";
import { NativeAgentProcess } from "./native-agent-process";

const execute = promisify(execFile);
const MAX_HANDLES = 4096;
const MAX_CURSORS = 64;
type CatalogPage = {
  entries: {
    sessionId: string;
    title: string | null;
    revision: number;
    lastActivityAtMs?: number;
  }[];
  nextCursor: string | null;
};
type Receipt = { workspace: Workspace; session: string; revision: number };
export type NativeRestoredChat = Readonly<{
  workspaceId: string;
  sessionId: string;
  checkWorkspace(): Promise<void>;
}>;
type Cursor = { workspaces: Workspace[]; index: number; after: string | null };
type Active = {
  archiveCatalog?(cursor: string | null): Promise<unknown>;
  unarchiveCatalog?(id: string, revision: number): Promise<void>;
};
type Request = {
  directory: string;
  root: string;
  cursor: string | null;
  restore?: { session: string; revision: number };
};
type Options = {
  resourcesPath: string;
  workspaces(): Promise<Workspace[]>;
  resolve(id: string): Promise<{ root: string }>;
  withStore<T>(
    workspace: Workspace,
    use: (active: Active | null, directory: string | null) => Promise<T>
  ): Promise<T>;
  /** Native command adapter; the owner still resolves all paths and handles. */
  execute?: (request: Request) => Promise<unknown>;
};

/** Cross-workspace presentation metadata, independent of model/worker startup. */
export class NativeArchives {
  private readonly receipts = new Map<string, Receipt>();
  private readonly cursors = new Map<string, Cursor>();
  private pending = false;
  constructor(private readonly options: Options) {}

  async list(
    cursor: string | null = null,
    check: () => void = () => {}
  ): Promise<DesktopArchivedChatPage> {
    return this.exclusive(async () => {
      check();
      let state: Cursor;
      if (cursor === null) {
        const workspaces = await this.options.workspaces();
        if (workspaces.length > 1024)
          throw new Error("native_archive_workspace_limit");
        state = {
          workspaces: workspaces.sort((a, b) => a.id.localeCompare(b.id)),
          index: 0,
          after: null,
        };
      } else {
        const captured = this.cursors.get(cursor);
        if (!captured) throw new Error("native_archive_cursor_invalid");
        state = { ...captured };
      }
      const unavailable: string[] = [];
      while (state.index < state.workspaces.length) {
        const workspace = state.workspaces[state.index];
        let page: CatalogPage;
        try {
          await this.requireWorkspace(workspace);
          check();
          page = await this.options.withStore(
            workspace,
            async (active, directory) => {
              check();
              if (active) {
                if (!active.archiveCatalog)
                  throw new Error("native_archive_catalog_unavailable");
                return readPage(await active.archiveCatalog(state.after));
              }
              return directory
                ? readPage(
                    await this.query({
                      directory,
                      root: workspace.root,
                      cursor: state.after,
                    })
                  )
                : { entries: [], nextCursor: null };
            }
          );
        } catch {
          unavailable.push(workspace.name);
          state.index += 1;
          state.after = null;
          continue;
        }
        await this.requireWorkspace(workspace);
        check();
        const entries = page.entries.map((entry) => {
          const id = randomUUID();
          remember(
            this.receipts,
            id,
            { workspace, session: entry.sessionId, revision: entry.revision },
            MAX_HANDLES
          );
          return {
            id,
            workspace: workspace.name,
            title: entry.title,
            revision: entry.revision,
            ...(entry.lastActivityAtMs !== undefined && {
              lastActivityAtMs: entry.lastActivityAtMs,
            }),
          };
        });
        state.after = page.nextCursor;
        if (!page.nextCursor) state.index += 1;
        if (entries.length) {
          let nextCursor: string | null = null;
          if (state.index < state.workspaces.length) {
            nextCursor = randomUUID();
            remember(this.cursors, nextCursor, state, MAX_CURSORS);
          }
          return {
            entries,
            nextCursor,
            ...(unavailable.length && { unavailableWorkspaces: unavailable }),
          };
        }
      }
      return {
        entries: [],
        nextCursor: null,
        ...(unavailable.length && { unavailableWorkspaces: unavailable }),
      };
    });
  }

  async unarchive(
    id: string,
    revision: number,
    check: () => void = () => {}
  ): Promise<NativeRestoredChat> {
    return this.exclusive(async () => {
      check();
      const receipt = this.receipts.get(id);
      if (
        !receipt ||
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        receipt.revision !== revision
      )
        throw new Error("native_archive_handle_invalid");
      await this.requireWorkspace(receipt.workspace);
      check();
      await this.options.withStore(
        receipt.workspace,
        async (active, directory) => {
          check();
          if (active) {
            if (!active.unarchiveCatalog)
              throw new Error("native_archive_catalog_unavailable");
            await active.unarchiveCatalog(receipt.session, revision);
          } else {
            if (!directory) throw new Error("native_archive_store_unavailable");
            check();
            const result = await this.query({
              directory,
              root: receipt.workspace.root,
              cursor: null,
              restore: { session: receipt.session, revision },
            });
            if (
              !result ||
              typeof result !== "object" ||
              !("restored" in result) ||
              result.restored !== true
            )
              throw new Error("native_archive_response_invalid");
          }
        }
      );
      await this.requireWorkspace(receipt.workspace);
      check();
      this.receipts.delete(id);
      return {
        workspaceId: receipt.workspace.id,
        sessionId: receipt.session,
        checkWorkspace: () => this.requireWorkspace(receipt.workspace),
      };
    });
  }

  private async requireWorkspace(workspace: Workspace): Promise<void> {
    const grant = await this.options.resolve(workspace.id);
    if (grant.root !== workspace.root)
      throw new Error("native_archive_workspace_changed");
  }

  private async query(request: Request): Promise<unknown> {
    if (this.options.execute) return this.options.execute(request);
    const args = [
      "archive-catalog",
      "--state-dir",
      request.directory,
      "--cwd",
      request.root,
    ];
    if (request.cursor) args.push("--cursor", request.cursor);
    if (request.restore)
      args.push(
        "--unarchive",
        request.restore.session,
        "--revision",
        String(request.restore.revision)
      );
    try {
      const { stdout } = await execute(
        NativeAgentProcess.executable(this.options.resourcesPath),
        args,
        {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
        }
      );
      return JSON.parse(stdout);
    } catch (error) {
      // Node's command errors contain native state paths. Expose stable codes
      // rather than passing process diagnostics into the hosted renderer.
      const stderr = (error as { stderr?: unknown }).stderr;
      if (
        typeof stderr === "string" &&
        stderr.includes("session_catalog_revision_changed")
      ) {
        throw new Error("native_archive_revision_changed");
      }
      throw new Error("native_archive_catalog_unavailable");
    }
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending) throw new Error("native_archive_busy");
    this.pending = true;
    try {
      return await operation();
    } finally {
      this.pending = false;
    }
  }
}

function remember<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  maximum: number
) {
  map.set(key, value);
  if (map.size > maximum) map.delete(map.keys().next().value!);
}

function readPage(value: unknown): CatalogPage {
  const page = value as CatalogPage;
  const token = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  if (
    !page ||
    !Array.isArray(page.entries) ||
    page.entries.length > 32 ||
    (page.nextCursor !== null && !token(page.nextCursor)) ||
    page.entries.some(
      (entry) =>
        !entry ||
        !token(entry.sessionId) ||
        (entry.title !== null &&
          (typeof entry.title !== "string" ||
            Buffer.byteLength(entry.title) > 256)) ||
        !Number.isSafeInteger(entry.revision) ||
        entry.revision < 0 ||
        (entry.lastActivityAtMs !== undefined &&
          (typeof entry.lastActivityAtMs !== "number" ||
            !Number.isSafeInteger(entry.lastActivityAtMs) ||
            entry.lastActivityAtMs < 0 ||
            entry.lastActivityAtMs > 8_640_000_000_000_000))
    ) ||
    new Set(page.entries.map((entry) => entry.sessionId)).size !==
      page.entries.length ||
    (page.nextCursor && !page.entries.length)
  )
    throw new Error("native_archive_response_invalid");
  return page;
}
