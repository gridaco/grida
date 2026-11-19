// GRIDA-SEC-004 / GRIDA-SEC-005 — read-only discovery belongs to the admitted app shell.
import type { DesktopChatCatalogQuery } from "@grida/desktop-bridge";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { ipc_sender } from "./ipc-sender";
import type { NativeChatCatalog } from "./native-chat-catalog";

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

export async function listDesktopChats(
  { sender, senderFrame: frame }: IpcMainInvokeEvent,
  value: unknown,
  catalog: Pick<NativeChatCatalog, "list"> | undefined,
  admitted: (sender: WebContents) => boolean
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
  if (!catalog) throw new Error("chat_catalog_unavailable");
  const query = readQuery(value);
  const stopWatching = ipc_sender.watchNavigation(sender, () => {
    revoked = true;
  });
  try {
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
    stopWatching();
  }
}
