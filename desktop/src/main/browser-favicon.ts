/** GRIDA-SEC-016 — bounded public raster icons through the actual guest Session. */
import type { Session } from "electron";
import { DesktopBrowser } from "@grida/desktop-bridge";

const svg = "image/svg+xml";
const mimeTypes = [svg, ...DesktopBrowser.FAVICON_MIME_TYPES];
const maxDataUrl = 64 + 4 * Math.ceil(DesktopBrowser.MAX_FAVICON_BYTES / 3);
type Candidate = { url: string; type: string; sizes: string };

function candidate(value: unknown): Candidate | null {
  const raw = typeof value === "string" ? { url: value } : value;
  if (!raw || typeof raw !== "object" || !("url" in raw)) return null;
  const { url, type = "", sizes = "" } = raw as Partial<Candidate>;
  if (
    typeof url !== "string" ||
    typeof type !== "string" ||
    type.length > 64 ||
    typeof sizes !== "string" ||
    sizes.length > 256
  )
    return null;
  const normalized =
    url.startsWith("data:") && url.length <= maxDataUrl
      ? url
      : DesktopBrowser.normalizeUrl(url);
  return normalized
    ? { url: normalized, type: type.trim().toLowerCase(), sizes }
    : null;
}

function preference(sizes: string): number {
  const sizesList = sizes.toLowerCase().split(/\s+/);
  if (sizesList.includes("any")) return 0;
  let best = Infinity;
  for (const size of sizesList) {
    const match = /^([1-9]\d{0,5})x([1-9]\d{0,5})$/.exec(size);
    if (!match) continue;
    const edge = Math.min(Number(match[1]), Number(match[2]));
    best = Math.min(best, Math.abs(Math.log2(edge / 32)));
  }
  return best === Infinity ? 0 : best;
}

function inlineSource(url: string): string | null {
  const parts = /^data:([^;,]+)(?:;charset=utf-8)?(;base64)?,(.*)$/is.exec(url);
  if (!parts || !mimeTypes.includes(parts[1].toLowerCase())) return null;
  if (parts[2] && !/^[a-z0-9+/]+={0,2}$/i.test(parts[3])) return null;
  const bytes = parts[2]
    ? Buffer.from(parts[3], "base64")
    : Buffer.from(decodeURIComponent(parts[3]));
  if (!bytes.length || bytes.length > DesktopBrowser.MAX_FAVICON_BYTES)
    return null;
  return `data:${parts[1].toLowerCase()};base64,${bytes.toString("base64")}`;
}

/** Transient metadata for one page document; no native image decoding or storage. */
export class BrowserFavicon {
  #value: DesktopBrowser.Favicon | null = null;
  #generation = 0;
  #key = "";
  #pending: readonly Candidate[] | null = null;
  #flight: AbortController | null = null;
  readonly #cache = new Map<
    string,
    { value: DesktopBrowser.Favicon; until: number }
  >();

  constructor(
    readonly options: {
      session: Pick<Session, "fetch">;
      decode(
        source: string,
        signal: AbortSignal
      ): Promise<DesktopBrowser.Favicon | null>;
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
    const candidates = reported
      .slice(0, 8)
      .map(candidate)
      .filter(
        (entry): entry is Candidate =>
          !!entry && (!entry.type || mimeTypes.includes(entry.type))
      )
      .reverse()
      .sort((a, b) => preference(a.sizes) - preference(b.sizes));
    const conventional = new URL("/favicon.ico", page).href;
    if (!candidates.some(({ url }) => url === conventional))
      candidates.push({ url: conventional, type: "", sizes: "" });
    const key = JSON.stringify(candidates);
    if (key === this.#key) return;
    this.#key = key;
    this.#generation++;
    this.#pending = candidates;
    this.#flight?.abort();
    this.#pump();
  }

  /** Sites without advertised candidates get one conventional fallback. */
  ensure(pageUrl: string): void {
    if (!this.#key) this.update([], pageUrl);
  }

  clear(): void {
    this.#generation++;
    this.#key = "";
    this.#pending = null;
    this.#flight?.abort();
    this.#cache.clear();
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
        if (
          this.#generation !== generation ||
          !this.options.current() ||
          value?.dataUrl === this.#value?.dataUrl
        )
          return;
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
    candidates: readonly Candidate[],
    signal: AbortSignal,
    current: () => boolean
  ): Promise<DesktopBrowser.Favicon | null> {
    const attempted = new Set<string>();
    for (const candidate of candidates) {
      if (!current()) return null;
      const key = candidate.url + "\n" + candidate.type;
      if (attempted.has(key)) continue;
      attempted.add(key);
      try {
        if (candidate.url.startsWith("data:")) {
          const source = inlineSource(candidate.url);
          const icon = source && (await this.options.decode(source, signal));
          if (icon) return icon;
          continue;
        }
        const cached = this.#cache.get(key);
        if (cached && cached.until > Date.now()) return cached.value;
        let url = candidate.url;
        for (let redirects = 0; redirects <= 3; redirects++) {
          if (!current()) return null;
          const response = await this.options.session.fetch(url, {
            method: "GET",
            redirect: "manual",
            credentials: "omit",
            cache: "no-store",
            signal,
            headers: { Accept: mimeTypes.join(", ") },
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
            const mime = response.headers
              .get("content-type")
              ?.split(";")[0]
              .trim()
              .toLowerCase();
            const type =
              (mime && mimeTypes.includes(mime) ? mime : candidate.type) ||
              (new URL(url).pathname.toLowerCase().endsWith(".svg")
                ? svg
                : "") ||
              DesktopBrowser.FAVICON_MIME_TYPES.find((type) =>
                DesktopBrowser.parseFavicon({
                  dataUrl: `data:${type};base64,${base64}`,
                })
              );
            if (type) {
              const icon = await this.options.decode(
                `data:${type};base64,${base64}`,
                signal
              );
              if (icon && current()) {
                if (redirects === 0)
                  this.#remember(key, icon, response.headers);
                return icon;
              }
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

  #remember(
    key: string,
    value: DesktopBrowser.Favicon,
    headers: Headers
  ): void {
    const policy = headers.get("cache-control") ?? "";
    if (
      /\b(?:no-store|no-cache|private)\b/i.test(policy) ||
      headers.get("vary") === "*"
    )
      return;
    const age = Number(headers.get("age") ?? 0);
    const lifetime =
      Number(/(?:^|,)\s*max-age=(\d+)/i.exec(policy)?.[1] ?? 0) - age;
    if (!(lifetime > 0)) return;
    this.#cache.delete(key);
    if (this.#cache.size >= 8)
      this.#cache.delete(this.#cache.keys().next().value!);
    this.#cache.set(key, {
      value,
      until: Date.now() + Math.min(lifetime, 300) * 1000,
    });
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
