/**
 * GRIDA-SEC-004 — IPC sender admission and safe diagnostics.
 *
 * Sender URLs can contain credentials in their query or fragment. Admission
 * needs the full parsed URL, but diagnostics expose only a web origin and
 * pathname.
 */
import { URL } from "node:url";
import type { WebContents } from "electron";

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

  export function isDocument(raw: string, docId: string): boolean {
    const url = parse(raw);
    const ids = url?.searchParams.getAll("docId");
    return (
      url?.pathname === "/desktop/file" && ids?.length === 1 && ids[0] === docId
    );
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

  /** Revoke a retained main-frame capability on navigation or teardown. */
  export function watchNavigation(
    sender: WebContents,
    revoke: () => void
  ): () => void {
    const navigating = (details: { isMainFrame: boolean }) => {
      if (details.isMainFrame) revoke();
    };
    const inPage = (_event: unknown, _url: string, isMainFrame: boolean) => {
      if (isMainFrame) revoke();
    };
    sender.on("did-start-navigation", navigating);
    sender.on("did-navigate-in-page", inPage);
    sender.on("did-navigate", revoke);
    sender.once("destroyed", revoke);
    sender.once("render-process-gone", revoke);
    return () => {
      sender.off("did-start-navigation", navigating);
      sender.off("did-navigate-in-page", inPage);
      sender.off("did-navigate", revoke);
      sender.off("destroyed", revoke);
      sender.off("render-process-gone", revoke);
    };
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
