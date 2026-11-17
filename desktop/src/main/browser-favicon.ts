/** GRIDA-SEC-016 — bounded public raster icons through the actual guest Session. */
import type { Session } from "electron";
import { DesktopBrowser } from "@grida/desktop-bridge";

/** Transient metadata for one page document; no native image decoding or storage. */
export class BrowserFavicon {
  #value: DesktopBrowser.Favicon | null = null;
  #generation = 0;
  #key = "";
  #pending: readonly string[] | null = null;
  #flight: AbortController | null = null;

  constructor(
    readonly options: {
      session: Pick<Session, "fetch">;
      current(): boolean;
      changed(): void;
    }
  ) {}

  get(): DesktopBrowser.Favicon | null {
    return this.options.current() ? this.#value : null;
  }

  /** Only the actual page's reported candidates enter this class. */
  update(reported: readonly unknown[], pageUrl: string): void {
    if (!this.options.current()) return;
    const page = DesktopBrowser.normalizeUrl(pageUrl);
    if (!page) return;
    const candidates: string[] = [];
    // Bound inspection independently of the number supplied by a website.
    for (const candidate of reported.slice(0, 8)) {
      const inline = DesktopBrowser.parseFavicon({ dataUrl: candidate });
      if (inline) {
        const key = "inline:" + inline.dataUrl;
        if (key === this.#key) return;
        this.#key = key;
        this.#generation++;
        this.#pending = null;
        this.#flight?.abort();
        if (inline.dataUrl !== this.#value?.dataUrl) {
          this.#value = inline;
          this.options.changed();
        }
        return;
      }
      const url = DesktopBrowser.normalizeUrl(candidate);
      if (!url || new URL(url).pathname.toLowerCase().endsWith(".svg"))
        continue;
      if (!candidates.includes(url)) candidates.push(url);
      if (candidates.length === 2) break;
    }
    const conventional = new URL("/favicon.ico", page).href;
    if (!candidates.includes(conventional)) candidates.push(conventional);
    const key = candidates.join("\n");
    if (key === this.#key) return;
    this.#key = key;
    this.#generation++;
    this.#pending = candidates;
    this.#flight?.abort();
    this.#pump();
  }

  /** Sites without advertised raster candidates get one conventional fallback. */
  ensure(pageUrl: string): void {
    if (!this.#key) this.update([], pageUrl);
  }

  clear(): void {
    this.#generation++;
    this.#key = "";
    this.#pending = null;
    this.#flight?.abort();
    if (this.#value !== null) {
      this.#value = null;
      this.options.changed();
    }
  }

  #pump(): void {
    if (this.#flight || !this.#pending || !this.options.current()) return;
    const candidates = this.#pending;
    this.#pending = null;
    const generation = this.#generation;
    const controller = new AbortController();
    this.#flight = controller;
    const timer = setTimeout(() => controller.abort(), 3000);
    timer.unref();
    const current = () =>
      this.#generation === generation &&
      !controller.signal.aborted &&
      this.options.current();
    void this.#fetch(candidates, controller.signal, current)
      .then((value) => {
        if (!current() || value?.dataUrl === this.#value?.dataUrl) return;
        this.#value = value;
        this.options.changed();
      })
      .catch(() => {
        /* An unavailable icon never fails its page. */
      })
      .finally(() => {
        clearTimeout(timer);
        if (this.#flight === controller) this.#flight = null;
        this.#pump();
      });
  }

  async #fetch(
    candidates: readonly string[],
    signal: AbortSignal,
    current: () => boolean
  ): Promise<DesktopBrowser.Favicon | null> {
    for (const candidate of candidates) {
      if (!current()) return null;
      try {
        let url = candidate;
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!current()) return null;
          const response = await this.options.session.fetch(url, {
            method: "GET",
            redirect: "manual",
            credentials: "omit",
            cache: "no-store",
            signal,
            headers: { Accept: DesktopBrowser.FAVICON_MIME_TYPES.join(", ") },
          });
          if (!current()) {
            this.#cancel(response);
            return null;
          }
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            this.#cancel(response);
            if (
              !location ||
              location.length > DesktopBrowser.MAX_URL_BYTES ||
              location.trim() !== location ||
              location.includes("\\") ||
              /[\p{Cc}\p{Cs}]/u.test(location) ||
              /^(?:https?:)?\/\/[^/?#]*@/i.test(location) ||
              redirects === 3
            )
              break;
            // Electron's Response.url can be incorrect. Resolve against the
            // exact URL we requested, then reapply the HTTP(S)/credential policy.
            const next = DesktopBrowser.normalizeUrl(
              new URL(location, url).href
            );
            if (!next) break;
            url = next;
            continue;
          }
          if (!response.ok) {
            this.#cancel(response);
            break;
          }
          const bytes = await this.#read(response, signal);
          if (!current()) return null;
          if (bytes) {
            const base64 = Buffer.from(bytes).toString("base64");
            // Content-Type is website metadata. The producer validates raster
            // framing, dimensions and exact MIME against the bounded bytes.
            for (const mime of DesktopBrowser.FAVICON_MIME_TYPES) {
              const icon = DesktopBrowser.parseFavicon({
                dataUrl: `data:${mime};base64,${base64}`,
              });
              if (icon) return icon;
            }
          }
          break;
        }
      } catch {
        /* Try the next bounded candidate, including the conventional icon. */
      }
    }
    return null;
  }

  async #read(
    response: Awaited<ReturnType<Session["fetch"]>>,
    signal: AbortSignal
  ): Promise<Uint8Array | null> {
    const length = response.headers.get("content-length");
    if (length !== null && Number(length) > DesktopBrowser.MAX_FAVICON_BYTES) {
      this.#cancel(response);
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      if (signal.aborted) return null;
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) return size ? Buffer.concat(chunks, size) : null;
        if (chunk.value.byteLength > DesktopBrowser.MAX_FAVICON_BYTES - size)
          return null;
        chunks.push(chunk.value);
        size += chunk.value.byteLength;
      }
      return null;
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  }

  #cancel(response: Awaited<ReturnType<Session["fetch"]>>): void {
    void response.body?.cancel().catch(() => {});
  }
}
