// GRIDA-SEC-004 — cross-workspace discovery uses only registered workspace stores.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type {
  DesktopChatCatalogEntry,
  DesktopChatCatalogPage,
  DesktopChatCatalogQuery,
} from "@grida/desktop-bridge";
import { readNativeSessionList } from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";
import { KeyedSerialQueue } from "./keyed-serial-queue";

type Workspace = Readonly<{ id: string; root: string }>;
type Source = Readonly<{ workspace: Workspace; cursor: string | null }>;
type Position = Pick<
  DesktopChatCatalogEntry,
  "workspaceId" | "sessionId" | "lastMessageAtMs"
>;
type Cursor = {
  generation: number;
  scope?: string;
  last: Position;
  sources: Source[];
};
type Candidate = { entry: DesktopChatCatalogEntry; resume: Source | null };
type Options = {
  generation?(): number;
  workspaces(): Promise<Workspace[]>;
  resolve(id: string): Promise<{ root: string }>;
  /** The owner checks the registered workspace before opening either source. */
  read(workspace: Workspace, cursor: string | null): Promise<unknown>;
};

const MAX_WORKSPACES = 1024;
const PAGE_SIZE = 32;
const READERS = 4;
const MAX_CURSORS = 64;
const MAX_PENDING = 8;

/** Compare the native key before the workspace tie-breaker, including undated chats. */
function order(a: Position, b: Position): number {
  const time = (b.lastMessageAtMs ?? -1) - (a.lastMessageAtMs ?? -1);
  if (time) return time;
  if (a.sessionId !== b.sessionId) return a.sessionId < b.sessionId ? -1 : 1;
  if (a.workspaceId === b.workspaceId) return 0;
  return a.workspaceId < b.workspaceId ? -1 : 1;
}

/** Merge native pages before applying the caller's limit. Cursors retain positions only. */
export class NativeChatCatalog {
  private readonly cursors = new Map<string, Cursor>();
  private pending = 0;
  // A closed store admits one native process at a time. Concurrent callers for
  // the same workspace use the same lane; only four reads can enter at once.
  private readonly readers = new KeyedSerialQueue();

  constructor(private readonly options: Options) {}

  async list(
    query: DesktopChatCatalogQuery = {},
    check: () => void = () => {}
  ): Promise<DesktopChatCatalogPage> {
    if (this.pending >= MAX_PENDING)
      throw new Error("native_chat_catalog_busy");
    this.pending++;
    try {
      const generation = this.options.generation?.() ?? 0;
      return await this.listPage(query, generation, () => {
        check();
        if (generation !== (this.options.generation?.() ?? 0))
          throw new Error("native_chat_catalog_scope_changed");
      });
    } finally {
      this.pending--;
    }
  }

  private async listPage(
    query: DesktopChatCatalogQuery,
    generation: number,
    check: () => void
  ) {
    check();
    const { workspaceId, cursor } = query;
    const limit = query.limit ?? PAGE_SIZE;
    const prior = cursor ? this.cursors.get(cursor) : undefined;
    if (
      cursor != null &&
      (!prior || prior.scope !== workspaceId || prior.generation !== generation)
    )
      throw new Error("native_chat_catalog_cursor_invalid");
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE)
      throw new Error("native_chat_catalog_limit_invalid");

    const sources = prior?.sources ?? (await this.start(workspaceId));
    const remaining = new Map<string, Source>();
    let top: Candidate[] = [];
    let more = false;
    for (let i = 0; i < sources.length; i += READERS) {
      check();
      const batch = sources.slice(i, i + READERS);
      // Keep the admission slot until every reader in this batch has settled.
      const pages = await Promise.allSettled(
        batch.map((source) => {
          const lane = parseInt(source.workspace.id.slice(-2), 16) % READERS;
          return this.readers.run(String(lane), () =>
            this.candidates(source, prior?.last, limit, check)
          );
        })
      );
      for (const result of pages) {
        if (result.status === "rejected") throw result.reason;
        const page = result.value;
        if (!page.start) continue;
        remaining.set(page.start.workspace.id, page.start);
        const merged = [...top, ...page.rows].sort((a, b) =>
          order(a.entry, b.entry)
        );
        more ||= merged.length > limit || page.more;
        top = merged.slice(0, limit);
      }
    }

    // Another workspace can be removed while the merge is reading its peers.
    const displayed = new Set(top.map(({ entry }) => entry.workspaceId));
    await Promise.all(
      [...displayed].map((id) =>
        this.requireWorkspace(remaining.get(id)!.workspace)
      )
    );
    check();
    for (const { entry, resume } of top) {
      if (resume) remaining.set(entry.workspaceId, resume);
      else remaining.delete(entry.workspaceId);
    }
    let nextCursor: string | null = null;
    if (more && top.length) {
      const {
        workspaceId: lastWorkspace,
        sessionId,
        lastMessageAtMs,
      } = top[top.length - 1].entry;
      nextCursor = randomUUID();
      this.cursors.set(nextCursor, {
        scope: workspaceId,
        generation,
        last: { workspaceId: lastWorkspace, sessionId, lastMessageAtMs },
        sources: [...remaining.values()],
      });
      if (this.cursors.size > MAX_CURSORS)
        this.cursors.delete(this.cursors.keys().next().value!);
    }
    return { entries: top.map(({ entry }) => entry), nextCursor };
  }

  private async start(id?: string): Promise<Source[]> {
    const workspaces =
      id === undefined
        ? await this.options.workspaces()
        : [{ id, ...(await this.options.resolve(id)) }];
    if (workspaces.length > MAX_WORKSPACES)
      throw new Error("native_chat_catalog_workspace_limit");
    return workspaces.map((workspace) => ({ workspace, cursor: null }));
  }

  private async requireWorkspace(workspace: Workspace) {
    const grant = await this.options.resolve(workspace.id);
    if (grant.root !== workspace.root)
      throw new Error("native_chat_catalog_workspace_changed");
  }

  private async candidates(
    source: Source,
    last: Position | undefined,
    limit: number,
    check: () => void
  ) {
    const { workspace } = source;
    const rows: Candidate[] = [];
    let start: Source | undefined;
    let previous: Position | undefined;
    let skipped = 0;
    let cursor = source.cursor;
    do {
      check();
      const response = await this.options.read(workspace, cursor);
      const page = readNativeSessionList(response, workspace.root, cursor);
      if (!page.runningSessionIds)
        throw new Error("native_chat_catalog_query_unavailable");
      for (const [index, session] of page.sessions.entries()) {
        const entry: DesktopChatCatalogEntry = {
          workspaceId: workspace.id,
          sessionId: session.sessionId,
          title: session.title,
          lastMessageAtMs: session.lastMessageAtMs ?? null,
          running: page.runningSessionIds.includes(session.sessionId),
          ...(page.inputNeededSessionIds && {
            inputNeeded: page.inputNeededSessionIds.includes(session.sessionId),
          }),
        };
        if (previous && order(previous, entry) >= 0)
          throw new Error("native_chat_catalog_order_invalid");
        previous = entry;
        if (last && order(entry, last) <= 0) {
          // Resuming a partial page can legitimately revisit one native page.
          // Allow one more page of intervening activity before asking the client
          // to refresh, so a busy store can't trigger an unbounded catch-up scan.
          if (++skipped > PAGE_SIZE * 2)
            throw new Error("native_chat_catalog_cursor_invalid");
          continue;
        }
        start ??= { workspace, cursor };
        // If the global page breaks inside this native page, read it again
        // at continuation and skip up to the emitted key. No stale rows are cached.
        const end = index + 1 === page.sessions.length;
        const resume =
          end && !page.nextCursor
            ? null
            : { workspace, cursor: end ? page.nextCursor : cursor };
        rows.push({ entry, resume });
        if (rows.length === limit)
          return { start, rows, more: resume !== null };
      }
      cursor = page.nextCursor;
    } while (cursor !== null);
    return { start, rows, more: false };
  }
}

const execute = promisify(execFile);

export async function readClosedChatCatalog(
  resourcesPath: string,
  directory: string,
  root: string,
  cursor: string | null
): Promise<unknown> {
  try {
    const { stdout } = await execute(
      NativeAgentProcess.executable(resourcesPath),
      [
        "chat-catalog",
        "--state-dir",
        directory,
        "--cwd",
        root,
        "--order",
        "message-activity",
        ...(cursor ? ["--cursor", cursor] : []),
      ],
      {
        timeout: 5_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      }
    );
    return JSON.parse(stdout);
  } catch {
    // Native command diagnostics may include private store paths.
    throw new Error("native_chat_catalog_unavailable");
  }
}
