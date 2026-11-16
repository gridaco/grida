// GRIDA-SEC-004 / GRIDA-SEC-005 — archived metadata belongs to admitted Settings.
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { ipc_sender } from "./ipc-sender";
import type { NativeArchives } from "./native-archives";

export class NativeArchiveIpc {
  constructor(
    private readonly archives: NativeArchives | undefined,
    private readonly admitted: (sender: WebContents) => boolean
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
    await this.archives!.unarchive(id, revision, check);
    check();
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
