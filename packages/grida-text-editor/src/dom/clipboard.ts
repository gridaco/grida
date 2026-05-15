/**
 * Browser-backed `Clipboard` impl.
 *
 * Uses the modern async Clipboard API when available; falls back to a
 * one-shot `document.execCommand("copy")` for older runtimes. Paste
 * always requires the async API (the legacy `paste` execCommand was
 * removed years ago).
 */

import type { Clipboard } from "../clipboard";

export class DomClipboard implements Clipboard {
  async copy(text: string): Promise<void> {
    if (!text) return;
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(text);
        return;
      } catch {
        // Permission denied, fall through to execCommand.
      }
    }
    fallback_copy(text);
  }

  async paste(): Promise<string> {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (!nav?.clipboard?.readText) return "";
    try {
      return await nav.clipboard.readText();
    } catch {
      return "";
    }
  }
}

/**
 * Final-resort copy via a hidden textarea + `execCommand`. Used when
 * the async API is unavailable or denied. Not exhaustively cross-
 * browser — the async API covers everything we care about.
 */
function fallback_copy(text: string): void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return;
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  doc.body.appendChild(ta);
  ta.select();
  try {
    doc.execCommand("copy");
  } catch {
    // best-effort
  }
  ta.remove();
}
