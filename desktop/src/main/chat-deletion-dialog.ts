// GRIDA-SEC-004 — deletion confirmation is owned by Main.
import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ipc_sender } from "./ipc-sender";

const ACTION = "https://chat-deletion.invalid/";

export async function confirmChatDeletion(
  parent: BrowserWindow,
  title: string | null,
  ownedChildren?: number
): Promise<boolean> {
  if (parent.isDestroyed()) return false;
  const owner = parent.webContents;
  const frame = owner.mainFrame;
  const href = frame.url;
  const [script, style] = await Promise.all([
    readFile(join(__dirname, "chat-deletion-renderer.js"), "base64"),
    readFile(join(__dirname, "chat-deletion-renderer.css"), "utf8"),
  ]);
  if (
    parent.isDestroyed() ||
    owner.mainFrame !== frame ||
    frame.url !== href ||
    owner.isLoadingMainFrame()
  )
    return false;
  const nonce = randomUUID();
  const data = JSON.stringify({
    title,
    ownedChildren,
    action: ACTION,
  }).replaceAll("<", "\\u003c");
  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
        <meta name="color-scheme" content="light dark">
        <title>Delete chat</title>
        <style>${style}</style>
      </head>
      <body>
        <div id="root"></div>
        <script type="application/json" id="dialog-data">${data}</script>
        <script nonce="${nonce}" src="data:text/javascript;base64,${script}"></script>
      </body>
    </html>`;
  const source = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const window = new BrowserWindow({
    parent,
    modal: true,
    title: "Delete chat",
    width: 512,
    height: ownedChildren ? 264 : 236,
    useContentSize: true,
    frame: false,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    webPreferences: {
      partition: "chat-deletion-confirmation",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      navigateOnDragDrop: false,
    },
  });
  window.removeMenu();
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-redirect", (event) => event.preventDefault());

  return new Promise<boolean>((resolve) => {
    let confirmed = false;
    const cancel = () => {
      if (!window.isDestroyed()) window.destroy();
    };
    const stopWatching = ipc_sender.watchNavigation(owner, cancel);
    window.once("closed", () => {
      stopWatching();
      resolve(confirmed);
    });
    contents.once("render-process-gone", cancel);
    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown" || input.key !== "Escape") return;
      event.preventDefault();
      cancel();
    });
    contents.on("will-navigate", (event) => {
      event.preventDefault();
      if (contents.getURL() !== source) return;
      const approve = event.url === `${ACTION}?answer=confirm`;
      if (!approve && event.url !== `${ACTION}?answer=cancel`) return;
      // Finish after Electron has processed the navigation veto.
      setImmediate(() => {
        if (window.isDestroyed()) return;
        confirmed = approve;
        cancel();
      });
    });
    window.once("ready-to-show", () => window.show());
    void window.loadURL(source).catch(cancel);
  });
}
