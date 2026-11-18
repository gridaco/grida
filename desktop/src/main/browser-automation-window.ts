// GRIDA-SEC-016 — a background shell has no application bridge or account session.
import { BrowserWindow, type WebContents } from "electron";

// Bundled with Main. The opaque document cannot fetch resources or run scripts
// of its own. Main inserts one webview carrying only its own one-use claim.
const HTML = `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>html,body{width:100%;height:100%;margin:0}webview{display:flex;width:100%;height:100%}</style>
<body></body>`;
export const AUTOMATION_SHELL_URL = `data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`;

export function createBrowserAutomationWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1024,
    height: 640,
    useContentSize: true,
    show: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      partition: "grida-browser-automation-shell",
      webviewTag: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const shell = window.webContents;
  shell.on("will-navigate", (event) => event.preventDefault());
  shell.setWindowOpenHandler(() => ({ action: "deny" }));
  return window;
}

export async function mountBrowserAutomationGuest(
  shell: WebContents,
  claim: string
): Promise<void> {
  await shell.executeJavaScript(`(() => {
    const guest = document.createElement('webview');
    guest.setAttribute('src', ${JSON.stringify(claim)});
    document.body.append(guest);
  })()`);
}

export async function focusBrowserAutomationGuest(
  shell: WebContents,
  guestId: number
): Promise<boolean> {
  // The displayed webview in the embedder owns keyboard routing. Match the
  // Main-registered guest, skipping pending or disconnected mount elements.
  return await shell.executeJavaScript(`(() => {
    const expected = ${JSON.stringify(guestId)};
    const guest = Array.from(document.querySelectorAll('webview')).find(node => {
      try { return node.isConnected && node.getWebContentsId() === expected; }
      catch { return false; }
    });
    if (!guest) return false;
    guest.focus({ preventScroll: true });
    return document.activeElement === guest;
  })()`);
}
