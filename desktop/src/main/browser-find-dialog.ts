/** GRIDA-SEC-016 — script-free native find for managed website windows. */
import { BrowserWindow, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { BrowserPageTools } from "./browser-page-tools";
import { BrowserDialogSessions } from "./browser-dialog-sessions";

export class BrowserFindDialog {
  static readonly #windows = new WeakMap<WebContents, BrowserWindow>();
  static open(
    parent: BrowserWindow,
    contents: WebContents,
    isLive: () => boolean
  ): void {
    if (!isLive() || contents.isDestroyed() || parent.isDestroyed()) return;
    const existing = this.#windows.get(contents);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return;
    }
    const token = randomUUID();
    const action = `https://browser-find.invalid/${token}`;
    const lease = BrowserDialogSessions.acquire("find");
    if (!lease) return;
    const isolated = lease.session;
    const source = `data:text/html;charset=utf-8,${encodeURIComponent(this.document(action))}`;
    const window = new BrowserWindow({
      parent,
      width: 460,
      height: 180,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: "Find in page",
      webPreferences: {
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webviewTag: false,
        webSecurity: true,
        disableDialogs: true,
        navigateOnDragDrop: false,
      },
    });
    this.#windows.set(contents, window);
    window.removeMenu();
    window.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        window.destroy();
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault()
    );
    const tools = new BrowserPageTools(contents, parent, isLive);
    let previous = "";
    let serial = 0;
    const close = () => {
      if (!window.isDestroyed()) window.destroy();
    };
    const navigation = (event: {
      isMainFrame: boolean;
      isSameDocument: boolean;
    }) => {
      if (event.isMainFrame && !event.isSameDocument) close();
    };
    const valid = () =>
      isLive() &&
      !contents.isDestroyed() &&
      !window.isDestroyed() &&
      !parent.isDestroyed();
    contents.once("destroyed", close);
    contents.on("did-start-navigation", navigation);
    parent.once("closed", close);
    window.once("closed", () => {
      this.#windows.delete(contents);
      contents.off("destroyed", close);
      contents.off("did-start-navigation", navigation);
      parent.off("closed", close);
      if (isLive() && !contents.isDestroyed()) {
        try {
          tools.stopFind();
        } catch {
          /* Retired guest. */
        }
      }
      lease.release();
    });
    // A canceled top-level POST can replace the form with Chromium's error page.
    // A local 204 response retains the live document and never reaches the network.
    lease.answerPost(action, valid);
    isolated.webRequest.onBeforeRequest(
      { urls: ["<all_urls>"] },
      (details, callback) => {
        const initial = details.url === source;
        const submitted =
          valid() &&
          details.url === action &&
          details.method === "POST" &&
          details.resourceType === "mainFrame" &&
          details.webContentsId === window.webContents.id &&
          window.webContents.getURL() === source;
        callback({ cancel: !(initial || submitted) });
        if (!submitted || !valid()) return;
        const request = this.parse(details.uploadData);
        if (!request) {
          window.setTitle("Find in page — invalid search");
          return;
        }
        if (request.action === "done") {
          close();
          return;
        }
        const findNext = previous === request.text;
        previous = request.text;
        const current = ++serial;
        if (!request.text) {
          tools.stopFind();
          window.setTitle("Find in page");
          return;
        }
        void tools
          .find({
            text: request.text,
            forward: request.action === "next",
            findNext,
            matchCase: false,
          })
          .then(
            (result) => {
              if (valid() && serial === current)
                window.setTitle(
                  `Find in page — ${result.activeMatchOrdinal} of ${result.matches}`
                );
            },
            () => {
              if (valid() && serial === current)
                window.setTitle("Find in page");
            }
          );
      }
    );
    window.once("ready-to-show", () => {
      if (valid()) window.show();
      else close();
    });
    void window.loadURL(source).catch(close);
  }
  static parse(
    parts: { bytes?: Buffer }[] | undefined
  ): { text: string; action: "next" | "previous" | "done" } | null {
    if (!parts || parts.length > 16) return null;
    let size = 0;
    const buffers: Buffer[] = [];
    for (const part of parts) {
      if (
        !Buffer.isBuffer(part.bytes) ||
        (size += part.bytes.byteLength) > 8192
      )
        return null;
      buffers.push(part.bytes);
    }
    const form = new URLSearchParams(Buffer.concat(buffers).toString("utf8"));
    if (
      [...form.keys()].length !== 2 ||
      form.getAll("text").length !== 1 ||
      form.getAll("action").length !== 1
    )
      return null;
    const text = form.get("text")!;
    const action = form.get("action");
    if (
      Buffer.byteLength(text) > DesktopBrowser.Utilities.MAX_FIND_BYTES ||
      /[\p{Cc}\p{Cs}]/u.test(text) ||
      !["next", "previous", "done"].includes(action!)
    )
      return null;
    return { text, action: action as "next" | "previous" | "done" };
  }
  static document(action: string): string {
    const nonce = randomUUID();
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; form-action https://browser-find.invalid; base-uri 'none'"><style nonce="${nonce}">:root{color-scheme:light dark;font:13px system-ui}body{margin:18px}input{box-sizing:border-box;width:100%;padding:7px}p{display:flex;gap:8px;justify-content:flex-end;margin:10px 0}button{padding:5px 10px}</style></head><body><form action="${action}" method="post" autocomplete="off"><input name="text" aria-label="Find in page" autofocus maxlength="1024"><p><button name="action" value="next">Next</button><button name="action" value="previous">Previous</button><button name="action" value="done" formnovalidate>Done</button></p></form></body></html>`;
  }
}
