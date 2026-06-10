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

/** The lookup half of {@link focusWindowByUrl} — find without focusing.
 *  Used where the caller needs the window's state first (e.g. the
 *  notification focus gate suppresses when the target IS focused). */
export function findWindowByUrl(needle: string): BrowserWindow | null {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    if (!w.webContents.getURL().includes(needle)) continue;
    return w;
  }
  return null;
}

export function focusWindowByUrl(needle: string): BrowserWindow | null {
  const w = findWindowByUrl(needle);
  if (!w) return null;
  if (w.isMinimized()) w.restore();
  w.focus();
  return w;
}
