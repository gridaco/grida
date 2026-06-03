/**
 * "Find an open window whose URL contains <needle>, focus it" — the
 * common deduplication pattern for `/desktop/settings` and per-workspace
 * windows.
 *
 * Match is by `webContents.getURL().includes(needle)`, which keeps the
 * call sites short and tolerant of trailing query strings or hashes.
 * Pass a needle specific enough to identify the target (e.g.
 * `/desktop/workspace?id=<encodedId>` rather than `/desktop/workspace`).
 */

import { BrowserWindow } from "electron";

export function focusWindowByUrl(needle: string): BrowserWindow | null {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    if (!w.webContents.getURL().includes(needle)) continue;
    if (w.isMinimized()) w.restore();
    w.focus();
    return w;
  }
  return null;
}
