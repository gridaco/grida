/** GRIDA-SEC-016 — website external-app handoffs never expose Grida native routes. */
import { dialog, shell, type BrowserWindow, type WebContents } from "electron";
import { ipc_sender } from "./ipc-sender";

export class BrowserExternalLinks {
  readonly #consent = new Set<string>();
  readonly #pending = new Set<WebContents>();
  readonly #aborts = new Set<AbortController>();
  static parse(raw: unknown): { url: string; scheme: string } | null {
    if (
      typeof raw !== "string" ||
      !raw ||
      Buffer.byteLength(raw) > 8192 ||
      /[\p{Cc}\p{Cs}\\\s]/u.test(raw) ||
      /%(?![\da-f]{2})/i.test(raw) ||
      raw.trim() !== raw
    )
      return null;
    const match = /^([a-z][a-z\d+.-]{0,63}):/i.exec(raw);
    if (!match) return null;
    const scheme = match[1].toLowerCase();
    if (
      [
        "http",
        "https",
        "file",
        "data",
        "blob",
        "about",
        "javascript",
        "vbscript",
        "node",
        "shell",
        "exec",
        "cmd",
        "command",
        "powershell",
        "ms-msdt",
        "search-ms",
        "filesystem",
        "view-source",
        "devtools",
        "ws",
        "wss",
      ].includes(scheme) ||
      /^(?:grida|chrome|chromium|electron)/.test(scheme)
    )
      return null;
    try {
      const url = new URL(raw);
      if (
        url.username ||
        url.password ||
        url.protocol !== `${scheme}:` ||
        Buffer.byteLength(url.href) > 8192
      )
        return null;
      return { url: url.href, scheme };
    } catch {
      return null;
    }
  }
  reset(): void {
    this.#consent.clear();
    for (const abort of this.#aborts) abort.abort();
  }
  async open(
    raw: unknown,
    options: {
      contents: WebContents;
      parent: BrowserWindow;
      trustedClick: boolean;
      source?: { origin: string; isCurrent(): boolean };
      isLive(): boolean;
    }
  ): Promise<boolean> {
    const target = BrowserExternalLinks.parse(raw);
    const { contents, parent } = options;
    if (
      !target ||
      contents.isDestroyed() ||
      parent.isDestroyed() ||
      !options.isLive() ||
      this.#pending.has(contents) ||
      this.#pending.size >= 4
    )
      return false;
    const frame = contents.mainFrame;
    const href = frame.url;
    const origin = options.source?.origin ?? frame.origin;
    let current = true;
    const abort = new AbortController();
    const revoke = ipc_sender.watchNavigation(contents, () => {
      current = false;
      abort.abort();
    });
    const live = () =>
      current &&
      (!options.source || options.source.isCurrent()) &&
      !abort.signal.aborted &&
      options.isLive() &&
      !contents.isDestroyed() &&
      !parent.isDestroyed() &&
      contents.mainFrame === frame &&
      !frame.detached &&
      frame.url === href;
    const checkFrame = () => {
      if (
        (!options.source && !options.trustedClick) ||
        (options.source && !options.source.isCurrent())
      ) {
        current = false;
        abort.abort();
      }
    };
    contents.on("did-start-navigation", checkFrame);
    let liveness: ReturnType<typeof setInterval> | undefined;
    const key = `${origin}\n${target.scheme}`;
    const cacheable = /^https?:\/\//.test(origin);
    this.#pending.add(contents);
    this.#aborts.add(abort);
    try {
      const ordinary =
        options.trustedClick &&
        ["mailto", "tel", "sms"].includes(target.scheme);
      if (
        !ordinary &&
        !(options.trustedClick && cacheable && this.#consent.has(key))
      ) {
        // A removed iframe has no public destroyed event. Check liveness only
        // while its native prompt is pending; never keep an idle page poll.
        liveness = setInterval(() => {
          if (!live()) {
            current = false;
            abort.abort();
          }
        }, 250);
        liveness.unref();
        const result = await dialog.showMessageBox(parent, {
          type: "question",
          message: "Open another app?",
          detail: `${!options.source && !options.trustedClick ? "Containing page: " : ""}${cacheable ? origin : "This generated page"} wants to open a ${target.scheme}: link in an app on your computer.`,
          buttons: ["Cancel", "Open app"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          signal: abort.signal,
        });
        if (!live() || result.response !== 1) return false;
        if (options.trustedClick && cacheable) {
          this.#consent.delete(key);
          this.#consent.add(key);
          while (this.#consent.size > 500)
            this.#consent.delete(this.#consent.values().next().value!);
        }
      }
      if (!live()) return false;
      await shell.openExternal(target.url);
      return true;
    } catch {
      // Unsupported/unregistered schemes and cancelled native prompts leave the
      // website intact. No website URL or credentials are written to a log.
      return false;
    } finally {
      revoke();
      contents.off("did-start-navigation", checkFrame);
      if (liveness) clearInterval(liveness);
      this.#pending.delete(contents);
      this.#aborts.delete(abort);
    }
  }
}
