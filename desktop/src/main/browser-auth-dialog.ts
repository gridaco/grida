/** GRIDA-SEC-016 — browser credentials stay in a dedicated native challenge. */
import { BrowserWindow, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { BrowserDialogSessions } from "./browser-dialog-sessions";

type Challenge = {
  parent: BrowserWindow;
  contents: WebContents;
  origin: string;
  realm?: string;
  isProxy?: boolean;
  isLive(): boolean;
};
type Credentials = { username: string; password: string };

/** A script-free credential form, isolated from Grida and the website session. */
export class BrowserAuthDialog {
  static readonly MAX_BODY_BYTES = 64 * 1024;
  static readonly #pending = new Map<
    WebContents,
    {
      key: string;
      isLive(): boolean;
      result: Promise<Credentials | null>;
    }
  >();

  static async prompt(options: Challenge): Promise<Credentials | null> {
    const key = JSON.stringify([
      options.origin,
      options.realm ?? "",
      !!options.isProxy,
    ]);
    const current = this.#pending.get(options.contents);
    if (current)
      return current.key === key && current.isLive() && options.isLive()
        ? current.result
        : null;
    if (this.#pending.size >= 8) return null;
    const result = this.#show(options);
    this.#pending.set(options.contents, {
      key,
      isLive: options.isLive,
      result,
    });
    try {
      return await result;
    } finally {
      if (this.#pending.get(options.contents)?.result === result)
        this.#pending.delete(options.contents);
    }
  }

  static async #show(options: Challenge): Promise<Credentials | null> {
    if (
      !options.isLive() ||
      options.contents.isDestroyed() ||
      options.parent.isDestroyed()
    )
      return Promise.resolve(null);
    const token = randomUUID();
    const action = `https://browser-auth.invalid/${token}`;
    const lease = BrowserDialogSessions.acquire("auth");
    if (!lease) return null;
    const isolated = lease.session;
    const source = `data:text/html;charset=utf-8,${encodeURIComponent(
      BrowserAuthDialog.document(action, options).toWellFormed()
    )}`;
    const window = new BrowserWindow({
      parent: options.parent,
      modal: true,
      show: false,
      width: 440,
      height: 340,
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: options.isProxy ? "Proxy sign-in" : "Website sign-in",
      webPreferences: {
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        disableDialogs: true,
        navigateOnDragDrop: false,
      },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault()
    );
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: Credentials | null) => {
        if (settled) return;
        settled = true;
        options.contents.removeListener("destroyed", cancel);
        options.contents.removeListener("did-start-navigation", navigation);
        options.parent.removeListener("closed", cancel);
        if (!window.isDestroyed()) window.destroy();
        lease.release();
        resolve(value);
      };
      const cancel = () => finish(null);
      const navigation = (details: { isMainFrame: boolean }) => {
        if (details.isMainFrame) cancel();
      };
      options.contents.once("destroyed", cancel);
      options.contents.on("did-start-navigation", navigation);
      options.parent.once("closed", cancel);
      window.once("closed", cancel);
      window.webContents.on("will-redirect", (event) => event.preventDefault());
      isolated.webRequest.onBeforeRequest(
        { urls: ["<all_urls>"] },
        (details, done) => {
          // Every network request is stopped before DNS or transmission.
          const initial = details.url === source;
          const submitted =
            details.url === action &&
            details.method === "POST" &&
            details.resourceType === "mainFrame" &&
            details.webContentsId === window.webContents.id &&
            window.webContents.getURL() === source;
          done({ cancel: !initial });
          if (!submitted || settled) return;
          const parts: Buffer[] = [];
          let length = 0;
          for (const part of details.uploadData ?? []) {
            if (!part.bytes || !Buffer.isBuffer(part.bytes)) {
              cancel();
              return;
            }
            length += part.bytes.byteLength;
            if (length > BrowserAuthDialog.MAX_BODY_BYTES) {
              cancel();
              return;
            }
            parts.push(part.bytes);
          }
          const body = new URLSearchParams(
            Buffer.concat(parts).toString("utf8")
          );
          if (
            body.get("action") !== "signin" ||
            !options.isLive() ||
            options.contents.isDestroyed() ||
            options.parent.isDestroyed()
          ) {
            cancel();
            return;
          }
          const username = body.get("username") ?? "";
          const password = body.get("password") ?? "";
          if (username.length > 1024 || password.length > 4096) {
            cancel();
            return;
          }
          finish({ username, password });
        }
      );
      window.once("ready-to-show", () => {
        if (settled) return;
        if (!options.isLive()) cancel();
        else window.show();
      });
      void window.loadURL(source).catch(cancel);
    });
  }

  static document(
    action: string,
    options: { origin: string; realm?: string; isProxy?: boolean }
  ): string {
    const escape = (value: string) =>
      value.replace(/[&<>"']/g, (character) => {
        const escaped: Record<string, string> = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        };
        return escaped[character];
      });
    const nonce = randomUUID();
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; form-action https://browser-auth.invalid; base-uri 'none'"><style nonce="${nonce}">
      :root { color-scheme: light dark; font: 13px system-ui; } body { margin: 24px; }
      h1 { font-size: 17px; margin: 0 0 8px; } p { overflow-wrap: anywhere; margin: 6px 0 14px; }
      label { display: block; margin-top: 12px; } input { box-sizing: border-box; width: 100%; padding: 7px; margin-top: 4px; }
      .buttons { display: flex; flex-direction: row-reverse; gap: 8px; margin-top: 18px; } button { padding: 6px 14px; }
      </style></head><body><h1>${options.isProxy ? "Proxy sign-in" : "Website sign-in"}</h1>
      <p>${escape(options.origin.slice(0, 2048))}</p>${options.realm ? `<p>${escape(options.realm.slice(0, 512))}</p>` : ""}
      <form action="${escape(action)}" method="post" autocomplete="off">
      <label>Username<input name="username" maxlength="1024" autofocus autocomplete="username"></label>
      <label>Password<input name="password" type="password" maxlength="4096" autocomplete="current-password"></label>
      <div class="buttons"><button name="action" value="signin" type="submit">Sign in</button><button name="action" value="cancel" type="submit" formnovalidate>Cancel</button></div>
      </form></body></html>`;
  }
}
