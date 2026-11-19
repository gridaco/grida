// GRIDA-SEC-004 — only Main's admitted workspace registry supplies paths to the catalog host.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DesktopChatCatalogPage,
  DesktopChatCatalogQuery,
  NativeChatReadChange,
} from "@grida/desktop-bridge";
import { readNativeSessionList } from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";

type Location = { id: string; cwd: string; stateDir: string };
type Connection = Pick<
  NativeAgentProcess,
  "connected" | "request" | "close" | "terminated"
>;
type Options = {
  directory: string;
  locations(): Promise<Location[]>;
  resolve(id: string): Promise<{ root: string }>;
  start(
    registry: string,
    changed: (detail: unknown) => void
  ): Promise<Connection | null>;
};
type Observer = { workspaceId?: string; changed: () => void };

/** One metadata-only ACP connection for this Desktop profile, shared by its windows. */
export class LiveChatCatalog {
  private readonly manifest: string;
  private readonly observers = new Set<Observer>();
  private generation = 0;
  private published = -1;
  private locations = new Map<string, Location>();
  private registryWrite?: Promise<void>;
  private connection?: Connection;
  private subscribed?: Connection;
  private observation = Promise.resolve();
  private opening?: Promise<Connection | null>;
  private unsupported = false;
  private recovery?: ReturnType<typeof setTimeout>;
  private retryMs = 100;
  private closed = false;
  private disposed = false;
  private teardown?: Promise<void>;

  constructor(private readonly options: Options) {
    this.manifest = path.join(options.directory, "catalog-workspaces.json");
  }

  async membershipChanged() {
    this.generation++;
    if (this.published < 0 && !this.registryWrite) return;
    try {
      await this.sync();
    } catch {
      // A failed admission lookup revokes the manifest until a later verified read.
      this.invalidate();
    }
  }

  private async publish(locations: Location[]) {
    const workspaces = locations.map(({ cwd, stateDir }) => ({
      cwd,
      stateDir,
    }));
    const temporary = this.manifest + "." + randomUUID();
    try {
      await fs.writeFile(temporary, JSON.stringify({ workspaces }), {
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(temporary, this.manifest);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  private async sync() {
    if (this.closed) throw new Error("chat_catalog_unavailable");
    if (this.published === this.generation) return;
    if (!this.registryWrite) {
      this.registryWrite = this.writeRegistry().finally(() => {
        this.registryWrite = undefined;
      });
    }
    await this.registryWrite;
    if (this.closed) throw new Error("chat_catalog_unavailable");
    if (this.published !== this.generation) await this.sync();
  }

  private async writeRegistry() {
    while (!this.closed && this.published !== this.generation) {
      const generation = this.generation;
      try {
        const locations = await this.options.locations();
        if (generation !== this.generation || this.closed) continue;
        await this.publish(locations);
        this.locations = new Map(
          locations.map((location) => [location.cwd, location])
        );
        this.published = generation;
      } catch (error) {
        this.locations.clear();
        await this.publish([]).catch(() =>
          fs.rm(this.manifest, { force: true })
        );
        throw error;
      }
    }
  }

  private invalidate(detail?: unknown) {
    const cwds = (detail as { cwds?: unknown } | null)?.cwds;
    const ids = Array.isArray(cwds)
      ? new Set(cwds.map((cwd) => this.locations.get(cwd)?.id))
      : null;
    for (const observer of this.observers) {
      if (!observer.workspaceId || !ids || ids.has(observer.workspaceId))
        observer.changed();
    }
  }

  private connect(): Promise<Connection | null> {
    if (this.closed)
      return Promise.reject(new Error("chat_catalog_unavailable"));
    if (this.unsupported) return Promise.resolve(null);
    if (this.connection?.connected) return Promise.resolve(this.connection);
    return (this.opening ??= this.open().finally(() => {
      this.opening = undefined;
    }));
  }

  private async open() {
    await this.sync();
    const child = await this.options.start(this.manifest, (detail) =>
      this.invalidate(detail)
    );
    if (!child) {
      this.unsupported = true;
      return null;
    }
    try {
      if (this.closed) throw new Error("chat_catalog_unavailable");
      this.connection = child;
      await this.updateObservation(child);
      this.retryMs = 100;
      void child.terminated.then(() => {
        if (this.connection !== child) return;
        this.connection = undefined;
        this.reconnect();
      });
      return child;
    } catch (error) {
      if (this.connection === child) this.connection = undefined;
      await child.close();
      throw error;
    }
  }

  /** Order subscribe/unsubscribe when windows open or close during an ACP request. */
  private updateObservation(child: Connection) {
    const update = this.observation.then(async () => {
      if (this.closed || this.connection !== child || !child.connected) return;
      if (this.observers.size && this.subscribed !== child) {
        await child.request("_co.grida/catalog/subscribe", {});
        this.subscribed = child;
      } else if (!this.observers.size && this.subscribed === child) {
        await child.request("_co.grida/catalog/unsubscribe", {});
        this.subscribed = undefined;
      }
    });
    this.observation = update.catch(() => {});
    return update;
  }

  private reconnect() {
    if (this.closed || this.recovery || !this.observers.size) return;
    this.recovery = setTimeout(() => {
      this.recovery = undefined;
      if (!this.observers.size) return;
      void this.connect().then(
        () => this.invalidate(),
        () => this.reconnect()
      );
    }, this.retryMs);
    this.recovery.unref();
    this.retryMs = Math.min(this.retryMs * 2, 5000);
  }

  async observe(workspaceId: string | undefined, changed: () => void) {
    if (workspaceId) await this.options.resolve(workspaceId);
    if (this.observers.size >= 64) throw new Error("native_chat_catalog_busy");
    const observer = { workspaceId, changed };
    this.observers.add(observer);
    try {
      const child = await this.connect();
      if (child) {
        await this.updateObservation(child);
        return () => {
          this.observers.delete(observer);
          if (!this.observers.size && this.connection)
            void this.updateObservation(this.connection).catch(() => {});
        };
      }
    } catch (error) {
      this.observers.delete(observer);
      throw error;
    }
    this.observers.delete(observer);
    return null;
  }

  list(
    query: DesktopChatCatalogQuery,
    check: () => void
  ): Promise<DesktopChatCatalogPage | null> {
    return this.readPage(query, check, true);
  }

  private async readPage(
    query: DesktopChatCatalogQuery,
    check: () => void,
    refreshMembership: boolean
  ): Promise<DesktopChatCatalogPage | null> {
    const connection = await this.connect();
    if (!connection) return null;
    await this.sync();
    const cwd = query.workspaceId
      ? (await this.options.resolve(query.workspaceId)).root
      : undefined;
    // A removable workspace can return without another registration event.
    if (cwd && this.locations.get(cwd)?.id !== query.workspaceId) {
      this.generation++;
      await this.sync();
    }
    const generation = this.generation;
    check();
    const raw = await connection
      .request("session/list", {
        ...(cwd && { cwd }),
        ...(query.cursor && { cursor: query.cursor }),
        _meta: {
          "co.grida/catalogOrder": "messageActivity",
          "co.grida/catalogLimit": query.limit ?? 32,
        },
      })
      .catch((error) => {
        if (
          error instanceof Error &&
          ["invalid_session_cursor", "catalog_scope_changed"].includes(
            error.message
          )
        )
          throw new Error("native_chat_catalog_cursor_invalid");
        throw error;
      });
    const page = readNativeSessionList(
      raw,
      cwd ?? new Set(this.locations.keys()),
      query.cursor ?? null
    );
    const rows = page.sessions.map((row) => {
      const location = this.locations.get(row.cwd);
      if (!location || (query.workspaceId && location.id !== query.workspaceId))
        throw new Error("chat_catalog_unavailable");
      return {
        workspaceId: location.id,
        sessionId: row.sessionId,
        title: row.title,
        lastMessageAtMs: row.lastMessageAtMs ?? null,
        lastActivityAtMs: row.lastActivityAtMs,
        readState: row.readState,
        running:
          row.running ??
          page.runningSessionIds?.includes(row.sessionId) ??
          false,
        inputNeeded:
          row.inputNeeded ??
          page.inputNeededSessionIds?.includes(row.sessionId),
      };
    });
    for (const root of new Set(page.sessions.map((row) => row.cwd))) {
      const id = this.locations.get(root)?.id;
      if (!id) throw new Error("chat_catalog_unavailable");
      try {
        if ((await this.options.resolve(id)).root !== root)
          throw new Error("chat_catalog_unavailable");
      } catch (error) {
        // An external drive may disappear without a registry event. Publish
        // the verified grants before querying the surviving workspaces again.
        if (cwd || !refreshMembership) throw error;
        this.generation++;
        await this.sync();
        if (this.locations.get(root)?.id === id) throw error;
        if (query.cursor) throw new Error("native_chat_catalog_cursor_invalid");
        check();
        return this.readPage(query, check, false);
      }
    }
    check();
    if (this.closed || generation !== this.generation)
      throw new Error("native_chat_catalog_cursor_invalid");
    return { entries: rows, nextCursor: page.nextCursor };
  }

  async setReadState(
    workspaceId: string,
    sessionId: string,
    change: NativeChatReadChange,
    check: () => void
  ) {
    const child = await this.connect();
    if (!child) throw new Error("native_chat_catalog_query_unavailable");
    await this.sync();
    const { root: cwd } = await this.options.resolve(workspaceId);
    if (this.locations.get(cwd)?.id !== workspaceId)
      throw new Error("chat_catalog_unavailable");
    check();
    const { kind: action, ...basis } = change;
    await child.request("_co.grida/session/read-state", {
      cwd,
      sessionId,
      action,
      ...basis,
    });
    check();
  }

  reset(shutdown = false) {
    this.closed = true;
    this.disposed ||= shutdown;
    return (this.teardown ??= this.closeConnection().finally(() => {
      this.teardown = undefined;
      if (this.disposed) this.observers.clear();
      else {
        this.closed = false;
        this.reconnect();
      }
    }));
  }

  private async closeConnection() {
    clearTimeout(this.recovery);
    this.recovery = undefined;
    await this.registryWrite?.catch(() => {});
    await this.opening?.catch(() => {});
    const child = this.connection;
    this.connection = undefined;
    await child?.close();
    this.subscribed = undefined;
    this.locations.clear();
    this.published = -1;
    this.generation++;
    await fs.rm(this.manifest, { force: true });
  }
}
