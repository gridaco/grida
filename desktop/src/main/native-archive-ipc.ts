// GRIDA-SEC-004 / GRIDA-SEC-005 — archived metadata belongs to admitted Settings.
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";
import { ipc_sender } from "./ipc-sender";
import type { NativeArchives, NativeRestoredChat } from "./native-archives";

const MAX_RESTORED_CHATS = 16;
const RESTORED_CHAT_TTL_MS = 60_000;
type RestoredChat = NativeRestoredChat & Readonly<{ expiresAt: number }>;
type SettingsFrame = Readonly<{
  frame: WebFrameMain;
  chats: Map<string, RestoredChat>;
  release(): void;
}>;

export class NativeArchiveIpc {
  private readonly restored = new WeakMap<WebContents, SettingsFrame>();

  constructor(
    private readonly archives: NativeArchives | undefined,
    private readonly admitted: (sender: WebContents) => boolean,
    private readonly openChat?: (
      workspaceId: string,
      sessionId: string
    ) => boolean
  ) {}

  async list(event: IpcMainInvokeEvent, cursor: unknown = null) {
    const check = this.capture(event);
    if (cursor !== null && (typeof cursor !== "string" || cursor.length > 128))
      throw new Error("native_archive_cursor_invalid");
    const result = await this.archives!.list(cursor, check);
    check();
    return result;
  }

  async unarchive(event: IpcMainInvokeEvent, id: unknown, revision: unknown) {
    const check = this.capture(event);
    if (
      typeof id !== "string" ||
      id.length > 128 ||
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new Error("native_archive_handle_invalid");
    const owner =
      this.openChat && event.senderFrame
        ? this.restoredFrame(event.sender, event.senderFrame)
        : undefined;
    const restored = await this.archives!.unarchive(id, revision, check);
    check();
    if (!owner || this.restored.get(event.sender) !== owner) return;
    owner.chats.set(id, {
      ...restored,
      expiresAt: Date.now() + RESTORED_CHAT_TTL_MS,
    });
    if (owner.chats.size > MAX_RESTORED_CHATS) {
      const oldest = owner.chats.keys().next().value;
      if (oldest) owner.chats.delete(oldest);
    }
  }

  async openRestored(event: IpcMainInvokeEvent, id: unknown): Promise<void> {
    const check = this.capture(event);
    if (typeof id !== "string" || id.length > 128)
      throw new Error("native_archive_handle_invalid");
    const owner = this.restored.get(event.sender);
    const restored = owner?.chats.get(id);
    if (
      !this.openChat ||
      !owner ||
      owner.frame !== event.senderFrame ||
      !restored ||
      restored.expiresAt <= Date.now()
    )
      throw new Error("native_archive_restored_chat_unavailable");
    owner.chats.delete(id);
    await restored.checkWorkspace().catch(() => {
      throw new Error("native_archive_workspace_changed");
    });
    check();
    if (
      this.restored.get(event.sender) !== owner ||
      !this.openChat(restored.workspaceId, restored.sessionId)
    )
      throw new Error("native_archive_restored_chat_unavailable");
  }

  private restoredFrame(
    sender: WebContents,
    frame: WebFrameMain
  ): SettingsFrame {
    const previous = this.restored.get(sender);
    if (previous?.frame === frame) return previous;
    previous?.release();
    const release = () => {
      if (this.restored.get(sender) === owner) this.restored.delete(sender);
      stopWatching();
    };
    const owner: SettingsFrame = { frame, chats: new Map(), release };
    this.restored.set(sender, owner);
    const stopWatching = ipc_sender.watchNavigation(
      sender,
      release,
      (url) => ipc_sender.pathname(url) === "/desktop/settings"
    );
    return owner;
  }

  private capture(event: IpcMainInvokeEvent) {
    const frame = event.senderFrame;
    const href = frame?.url;
    const check = () => {
      if (
        !frame ||
        !href ||
        event.sender.isDestroyed() ||
        event.sender.isLoadingMainFrame() ||
        event.sender.mainFrame !== frame ||
        frame.url !== href ||
        ipc_sender.pathname(href) !== "/desktop/settings" ||
        !this.admitted(event.sender)
      )
        throw new Error("native_archive_settings_required");
      if (!this.archives) throw new Error("native_archive_unavailable");
    };
    check();
    return check;
  }
}
