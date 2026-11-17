/** GRIDA-SEC-016 — utilities operate only on an already-admitted actual guest. */
import type { BrowserWindow, WebContents } from "electron";
import { DesktopBrowser } from "@grida/desktop-bridge";

export class BrowserPageTools {
  static readonly #pending = new WeakMap<WebContents, () => void>();
  constructor(
    readonly contents: WebContents,
    readonly parent: BrowserWindow,
    readonly isLive: () => boolean
  ) {}
  #check(): void {
    if (
      !this.isLive() ||
      this.contents.isDestroyed() ||
      this.parent.isDestroyed()
    )
      throw new Error("browser_guest_unavailable");
  }
  find(
    request: Pick<
      DesktopBrowser.Utilities.Find,
      "text" | "forward" | "findNext" | "matchCase"
    >
  ): Promise<DesktopBrowser.Utilities.FindResult> {
    this.#check();
    BrowserPageTools.#pending.get(this.contents)?.();
    return new Promise((resolve, reject) => {
      let id = -1;
      const finish = (
        error?: Error,
        result?: DesktopBrowser.Utilities.FindResult
      ) => {
        clearTimeout(timeout);
        if (BrowserPageTools.#pending.get(this.contents) === expired)
          BrowserPageTools.#pending.delete(this.contents);
        this.contents.off("found-in-page", found);
        this.contents.off("destroyed", expired);
        this.contents.off("did-start-navigation", navigation);
        if (error) reject(error);
        else resolve(result!);
      };
      const expired = () => finish(new Error("browser_find_expired"));
      const navigation = (event: {
        isMainFrame: boolean;
        isSameDocument: boolean;
      }) => {
        if (event.isMainFrame && !event.isSameDocument) expired();
      };
      const found = (
        _event: unknown,
        result: {
          requestId: number;
          finalUpdate: boolean;
          matches: number;
          activeMatchOrdinal: number;
        }
      ) => {
        if (result.requestId !== id || !result.finalUpdate) return;
        if (!this.isLive()) return expired();
        const parsed = DesktopBrowser.Utilities.parseFindResult({
          matches: result.matches,
          activeMatchOrdinal: result.activeMatchOrdinal,
        });
        if (!parsed) return finish(new Error("browser_find_invalid_result"));
        finish(undefined, parsed);
      };
      BrowserPageTools.#pending.set(this.contents, expired);
      const timeout = setTimeout(expired, 5000);
      timeout.unref();
      this.contents.on("found-in-page", found);
      this.contents.once("destroyed", expired);
      this.contents.on("did-start-navigation", navigation);
      try {
        id = this.contents.findInPage(request.text, {
          forward: request.forward,
          findNext: request.findNext,
          matchCase: request.matchCase,
        });
      } catch (error) {
        finish(
          error instanceof Error ? error : new Error("browser_find_failed")
        );
      }
    });
  }
  stopFind(): void {
    this.#check();
    BrowserPageTools.#pending.get(this.contents)?.();
    this.contents.stopFindInPage("clearSelection");
  }
  getZoom(): number {
    this.#check();
    const factor = DesktopBrowser.Utilities.parseZoomFactor(
      this.contents.getZoomFactor()
    );
    if (factor === null) throw new Error("browser_zoom_unavailable");
    return factor;
  }
  setZoom(raw: unknown): number {
    this.#check();
    const request = DesktopBrowser.Utilities.parseZoom(raw);
    if (!request) throw new Error("browser_zoom_invalid");
    this.contents.setZoomFactor(request.factor);
    return this.getZoom();
  }
  print(): Promise<void> {
    this.#check();
    return new Promise((resolve, reject) =>
      this.contents.print({ silent: false }, (success, reason) => {
        if (
          success ||
          reason === "cancelled" ||
          reason === "Print job canceled"
        )
          resolve();
        else reject(new Error("browser_print_failed"));
      })
    );
  }
  inspect(): void {
    this.#check();
    this.contents.openDevTools({ mode: "detach" });
  }
}
