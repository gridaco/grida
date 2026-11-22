/** Renderer client for the optional native browser capability. */
import { DesktopBrowser } from "@grida/desktop-bridge";
import { getDesktopBridge } from "./bridge";
import { BrowserLinkPreferences } from "./browser-link-preferences";

export namespace Browser {
  export type OpenDestination = BrowserLinkPreferences.Destination;

  /** Omit the destination to use the current preference. Returns acceptance. */
  export type OpenHandler = (
    url: string,
    destination?: OpenDestination
  ) => boolean;

  /** Bind deliberate link opens to a Desktop surface and its workbench. */
  export function opener(
    openInWorkbench?: (url: string) => boolean
  ): OpenHandler {
    return (input, destination) => {
      const url = DesktopBrowser.normalizeUrl(input);
      if (!url) return false;
      const target =
        destination ?? BrowserLinkPreferences.read()[linkKind(url)];
      if (target === "grida") {
        if (openInWorkbench?.(url)) return true;
        if (destination === "grida") return false;
      }

      const shell = getDesktopBridge()?.shell;
      if (!shell?.open_external) return false;
      void shell.open_external(url).catch(() => {
        console.warn("Couldn’t open the system browser.");
      });
      return true;
    };
  }

  function linkKind(url: string): BrowserLinkPreferences.Kind {
    const host = new URL(url).hostname.replace(/\.$/, "");
    return host === "localhost" ||
      host.endsWith(".localhost") ||
      /^127(?:\.\d+){3}$/.test(host) ||
      host === "[::1]" ||
      host === "0.0.0.0"
      ? "local"
      : "web";
  }

  export function getBridge(): DesktopBrowser.Bridge | null {
    const bridge = getDesktopBridge();
    return bridge?.caps.native.browser &&
      bridge.browser?.version === DesktopBrowser.VERSION &&
      bridge.browser.presentation === "webview"
      ? bridge.browser
      : null;
  }

  export function isSupported(): boolean {
    return getBridge() !== null;
  }

  export type Destination = Readonly<{
    kind: "url" | "search";
    url: string;
    input: string;
  }>;

  /** Classifies a submission without sending typed text to a search service. */
  export function destination(value: string): Destination | null {
    if (/[\p{Cc}\p{Cs}]/u.test(value)) return null;
    const input = value.trim();
    if (!input) return null;
    const explicit = DesktopBrowser.normalizeUrl(input);
    if (explicit) return { kind: "url", url: explicit, input };
    const port = /^(?:[^\s/:?#@]+|\[[0-9a-f:]+\]):\d+(?:[/?#]|$)/i.test(input);
    const searchOperator =
      /^(?:site|filetype|ext|intitle|inurl|intext|allintitle|allinurl|allintext|related|before|after):/i.test(
        input
      );
    if (searchOperator) {
      const url = googleSearch(input);
      return url ? { kind: "search", url, input } : null;
    }
    const scheme = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(input);
    if (scheme && !port) {
      const blocked =
        /^(?:https?|javascript|vbscript|data|file|filesystem|blob|about|grida(?:-[a-z-]+)?|chrome(?:-extension)?|edge|devtools|view-source|mailto|tel|ftp|ftps|wss?|content|resource|electron|app)$/i.test(
          scheme[1]
        );
      if (blocked || !/^\s+\S/.test(scheme[2])) return null;
      const url = googleSearch(input);
      return url ? { kind: "search", url, input } : null;
    }
    if (!/\s/.test(input)) {
      if (
        input.includes("\\") ||
        input.startsWith("//") ||
        /^[^/\s@]+@[^/\s]+[/?#]/.test(input)
      )
        return null;
      const authority = input.split(/[/?#]/, 1)[0];
      const host = authority.replace(/:\d+$/, "");
      const ip =
        /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
        /^\[[0-9a-f:]+\]$/i.test(host);
      const hostname = /^(?:[^.\s:/?#@]+\.)+[^.\s:/?#@]+\.?$/.test(host);
      if (host.toLowerCase() === "localhost" || ip || hostname || port) {
        const local =
          host.toLowerCase() === "localhost" || ip || (port && !hostname);
        const url = DesktopBrowser.normalizeUrl(
          `${local ? "http" : "https"}://${input}`
        );
        return url ? { kind: "url", url, input } : null;
      }
    }
    const url = googleSearch(input);
    return url ? { kind: "search", url, input } : null;
  }

  export function googleSearch(query: string): string | null {
    if (!query.trim() || /[\p{Cc}\p{Cs}]/u.test(query)) return null;
    return DesktopBrowser.normalizeUrl(
      `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`
    );
  }

  /** Final navigation target for a URL or an explicitly submitted Google query. */
  export function address(value: string): string | null {
    return destination(value)?.url ?? null;
  }
}
