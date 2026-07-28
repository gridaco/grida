/**
 * GRIDA-SEC-004 — IPC sender admission and safe diagnostics.
 *
 * Sender URLs can contain credentials in their query or fragment. Admission
 * needs the full parsed URL, but diagnostics expose only a web origin and
 * pathname.
 */
import { URL } from "node:url";

export namespace ipc_sender {
  export function isAllowed(
    raw: string | undefined,
    editorOrigin: string
  ): boolean {
    const url = parse(raw);
    if (!url || !editorOrigin || url.origin !== editorOrigin) return false;
    return url.pathname === "/desktop" || url.pathname.startsWith("/desktop/");
  }

  export function pathname(raw: string | undefined): string | null {
    return parse(raw)?.pathname ?? null;
  }

  export function diagnostic(raw: string | undefined): string {
    if (!raw) return "<no frame>";
    const url = parse(raw);
    if (!url) return "<invalid URL>";
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `<${url.protocol.slice(0, -1)} URL>`;
    }
    return `${url.origin}${url.pathname}`;
  }
}

function parse(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}
