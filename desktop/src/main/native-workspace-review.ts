// GRIDA-SEC-004 — confirm a native action on the exact focused workbench.
import { BrowserWindow, dialog } from "electron";
import { ipc_sender } from "./ipc-sender";

export type WorkspaceReviewReceipt =
  | {
      kind: "approved";
      check: () => void;
      signal: AbortSignal;
      close: () => void;
    }
  | { kind: "declined" | "unavailable" };

export class NativeWorkspaceReview {
  private reviewing = false;

  constructor(
    private readonly origin: string,
    private readonly admits: (window: BrowserWindow) => boolean
  ) {}

  async confirm(
    workspaceId: string,
    requestSignal: AbortSignal,
    prompt: { message: string; detail: string; accept: string }
  ): Promise<WorkspaceReviewReceipt> {
    const window = BrowserWindow.getFocusedWindow();
    if (!window || window.isDestroyed() || this.reviewing)
      return { kind: "unavailable" };
    const sender = window.webContents;
    if (sender.isDestroyed()) return { kind: "unavailable" };
    const frame = sender.mainFrame;
    const href = frame.url;
    const url = URL.parse(href);
    if (
      !url ||
      url.origin !== this.origin ||
      url.pathname !== "/desktop/workspace" ||
      url.searchParams.getAll("id").length !== 1 ||
      url.searchParams.get("id") !== workspaceId
    )
      return { kind: "unavailable" };

    const navigation = new AbortController();
    const signal = AbortSignal.any([requestSignal, navigation.signal]);
    const check = () => {
      signal.throwIfAborted();
      if (
        window.isDestroyed() ||
        sender.isDestroyed() ||
        sender.isLoadingMainFrame() ||
        !this.admits(window) ||
        sender.mainFrame !== frame ||
        frame.url !== href
      )
        throw new Error("workspace_action_review_unavailable");
    };
    const close = ipc_sender.watchNavigation(sender, () => navigation.abort());
    let approved = false;
    this.reviewing = true;
    try {
      check();
      const { response } = await dialog.showMessageBox(window, {
        type: "question",
        message: prompt.message,
        detail: prompt.detail,
        buttons: ["Cancel", prompt.accept],
        defaultId: 0,
        cancelId: 0,
        signal,
      });
      check();
      if (response !== 1) return { kind: "declined" };
      approved = true;
      return { kind: "approved", check, signal, close };
    } catch {
      return { kind: "unavailable" };
    } finally {
      this.reviewing = false;
      if (!approved) close();
    }
  }
}
