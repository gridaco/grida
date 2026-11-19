// GRIDA-SEC-004 / GRIDA-SEC-005 — only the admitted app shell can discover chats or update workspace read positions.
import type {
  DesktopChatCatalogQuery,
  NativeChatPage,
  NativeChatReadChange,
} from "@grida/desktop-bridge";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { ipc_sender } from "./ipc-sender";
import type { DesktopChatCatalog } from "./native-desktop-chat-catalog";
import { IPC_CHANNELS } from "../bridge/contract";

function readQuery(value: unknown = {}): DesktopChatCatalogQuery {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("chat_catalog_query_invalid");
  const { workspaceId, cursor, limit } = value as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) => !["workspaceId", "cursor", "limit"].includes(key)
    ) ||
    (workspaceId !== undefined &&
      (typeof workspaceId !== "string" ||
        !/^[a-f0-9]{16}$/.test(workspaceId))) ||
    (cursor != null &&
      (typeof cursor !== "string" || !cursor.length || cursor.length > 128)) ||
    (limit !== undefined &&
      (typeof limit !== "number" ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 32))
  )
    throw new Error("chat_catalog_query_invalid");
  return { workspaceId, cursor, limit };
}

type Admitted = (sender: WebContents) => boolean;

function frameLease(
  { sender, senderFrame: frame }: IpcMainInvokeEvent,
  admitted: Admitted,
  onRevoke?: () => void
) {
  const href = frame?.url;
  let revoked = false;
  const check = () => {
    const route = ipc_sender.pathname(href);
    if (
      revoked ||
      !frame ||
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      sender.mainFrame !== frame ||
      frame.url !== href ||
      !admitted(sender) ||
      (route !== "/desktop/welcome" && route !== "/desktop/workspace")
    )
      throw new Error("chat_catalog_unavailable");
  };
  check();
  const release = ipc_sender.watchNavigation(sender, () => {
    revoked = true;
    onRevoke?.();
  });
  return { check, release };
}

export async function listDesktopChats(
  event: IpcMainInvokeEvent,
  value: unknown,
  catalog: Pick<DesktopChatCatalog, "list"> | undefined,
  admitted: Admitted
) {
  const query = readQuery(value);
  const { check, release } = frameLease(event, admitted);
  try {
    if (!catalog) throw new Error("chat_catalog_unavailable");
    const page = await catalog.list(query, check);
    check();
    return page;
  } catch (error) {
    // Preserve the outcomes a caller can act on. Store and registry errors
    // can include native paths or command diagnostics.
    if (
      error instanceof Error &&
      [
        "native_chat_catalog_cursor_invalid",
        "native_chat_catalog_busy",
        "native_chat_catalog_query_unavailable",
      ].includes(error.message)
    )
      throw new Error(error.message);
    throw new Error("chat_catalog_unavailable");
  } finally {
    release();
  }
}

function currentWorkspace(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  if (!url || ipc_sender.pathname(url) !== "/desktop/workspace") return null;
  const id = new URL(url).searchParams.get("id");
  return id && /^[a-f0-9]{16}$/.test(id) ? id : null;
}

/** Keep each observer on its admitted top-level document. Window navigation releases it. */
export class DesktopChatCatalogIpc {
  private readonly observers = new WeakMap<
    WebContents,
    Map<string, () => void>
  >();

  constructor(
    private readonly catalog: DesktopChatCatalog | undefined,
    private readonly admitted: Admitted
  ) {}

  async observe(
    event: IpcMainInvokeEvent,
    token: unknown,
    scope: unknown
  ): Promise<boolean> {
    if (typeof token !== "string" || !/^[a-f0-9-]{36}$/.test(token))
      throw new Error("chat_catalog_query_invalid");
    const query = readQuery(scope);
    if (query.limit !== undefined || query.cursor !== undefined)
      throw new Error("chat_catalog_query_invalid");
    if (!this.catalog) return false;
    const sender = event.sender;
    let observers = this.observers.get(sender);
    if (!observers) this.observers.set(sender, (observers = new Map()));
    if (observers.size >= 8 || observers.has(token))
      throw new Error("native_chat_catalog_busy");
    let stop: (() => void) | null = null;
    let stopped = false;
    const release = () => {
      stopped = true;
      stop?.();
      lease.release();
      observers.delete(token);
    };
    const lease = frameLease(event, this.admitted, release);
    observers.set(token, release);
    try {
      stop = await this.catalog.live.observe(query.workspaceId, () => {
        if (stopped) return;
        try {
          lease.check();
          sender.send(IPC_CHANNELS.CHAT_CATALOG_CHANGED, token);
        } catch {
          release();
        }
      });
      lease.check();
      if (!stop || stopped) {
        release();
        return false;
      }
      return true;
    } catch {
      release();
      throw new Error("chat_catalog_unavailable");
    }
  }

  unobserve(event: IpcMainInvokeEvent, token: unknown) {
    if (typeof token === "string")
      this.observers.get(event.sender)?.get(token)?.();
  }

  async pickerPage(
    event: IpcMainInvokeEvent,
    cursor?: string | null
  ): Promise<NativeChatPage | null> {
    const workspaceId = currentWorkspace(event);
    if (!workspaceId || !this.catalog) return null;
    const query = readQuery({ workspaceId, cursor });
    const lease = frameLease(event, this.admitted);
    try {
      const page = await this.catalog.live.list(query, lease.check);
      if (!page) return null;
      const rows = page.entries;
      return {
        sessionIds: rows.map((r) => r.sessionId),
        titles: rows.flatMap((r) =>
          r.title ? [{ sessionId: r.sessionId, title: r.title }] : []
        ),
        runningSessionIds: rows
          .filter((r) => r.running)
          .map((r) => r.sessionId),
        inputNeededSessionIds: rows
          .filter((r) => r.inputNeeded)
          .map((r) => r.sessionId),
        readStates: rows.flatMap((r) =>
          r.readState ? [{ sessionId: r.sessionId, ...r.readState }] : []
        ),
        lastMessage: rows.flatMap((r) =>
          r.lastMessageAtMs !== null
            ? [{ sessionId: r.sessionId, atMs: r.lastMessageAtMs }]
            : []
        ),
        lastActivity: rows.flatMap((r) =>
          r.lastActivityAtMs !== undefined
            ? [{ sessionId: r.sessionId, atMs: r.lastActivityAtMs }]
            : []
        ),
        nextCursor: page.nextCursor,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "native_chat_catalog_cursor_invalid",
          "native_chat_catalog_busy",
        ].includes(error.message)
      )
        throw error;
      throw new Error("chat_catalog_unavailable");
    } finally {
      lease.release();
    }
  }

  async read(event: IpcMainInvokeEvent, sessionId: unknown, input: unknown) {
    const workspaceId = currentWorkspace(event);
    if (
      !workspaceId ||
      !this.catalog ||
      typeof sessionId !== "string" ||
      !/^[A-Za-z0-9_.:@/-]{1,256}$/.test(sessionId) ||
      !input ||
      typeof input !== "object"
    )
      throw new Error("chat_catalog_query_invalid");
    const change = input as NativeChatReadChange;
    if (
      !(change.kind === "markUnread" && Object.keys(input).length === 1) &&
      !(
        change.kind === "acknowledge" &&
        Object.keys(input).length === 3 &&
        Number.isSafeInteger(change.revision) &&
        change.revision >= 0 &&
        (change.replyId === null ||
          (typeof change.replyId === "string" &&
            /^[A-Za-z0-9_.:@/-]{1,256}$/.test(change.replyId)))
      )
    )
      throw new Error("chat_catalog_query_invalid");
    const lease = frameLease(event, this.admitted);
    try {
      await this.catalog.live.setReadState(
        workspaceId,
        sessionId,
        change,
        lease.check
      );
    } catch {
      throw new Error("chat_catalog_unavailable");
    } finally {
      lease.release();
    }
  }
}
