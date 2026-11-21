/** GRIDA-SEC-016 — display-only metadata from explicitly addressed loopback pages. */
import { get as httpGet, type IncomingMessage } from "node:http";
import { get as httpsGet } from "node:https";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { DesktopBrowser, WebPreview } from "@grida/desktop-bridge";
import { BrowserFaviconDecoder } from "./browser-favicon-decoder";

type Element = DefaultTreeAdapterTypes.Element;
type Display = Pick<WebPreview.Metadata, "title" | "description">;
type Result = WebPreview.Metadata | null;
const HTML_BYTES = 64 * 1024;
const ICON_MIME_TYPES = ["image/svg+xml", ...DesktopBrowser.FAVICON_MIME_TYPES];

export type WebPreviewProviderContext = Readonly<{
  url: string;
  signal: AbortSignal;
  metadata: WebPreview.Metadata;
  /** One bounded GET to a path on the page's origin. */
  read(path: string): Promise<string | null>;
}>;

export type WebPreviewProvider = Readonly<{
  id: string;
  match: { meta: string; attributes: Readonly<Record<string, string>> };
  productLabel: string;
  resolve?(context: WebPreviewProviderContext): Promise<Display | null>;
}>;

type Pending = {
  scope: string;
  url: string;
  started: boolean;
  readers: number;
  hasIcon: boolean;
  iconSkipped?: boolean;
  controller: AbortController;
  result: Promise<Result>;
  resolve(result: Result): void;
};

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Cs}]/gu, "")
    .trim();
  let bytes = 0;
  let end = 0;
  for (const character of cleaned) {
    bytes += Buffer.byteLength(character);
    if (bytes > limit) break;
    end += character.length;
  }
  return cleaned.slice(0, end).trimEnd() || undefined;
}

function display(title: unknown, description: unknown): Display {
  const name = text(title, WebPreview.MAX_TITLE_BYTES);
  const summary = text(description, WebPreview.MAX_DESCRIPTION_BYTES);
  return {
    ...(name && { title: name }),
    ...(summary && { description: summary }),
  };
}

function sameOrigin(
  value: string,
  base: string,
  origin: string
): string | null {
  try {
    const candidate = new URL(value, base);
    return candidate.origin === origin
      ? WebPreview.normalizeUrl(candidate.href)
      : null;
  } catch {
    return null;
  }
}

async function request(
  url: URL,
  signal: AbortSignal
): Promise<IncomingMessage> {
  const host = url.hostname;
  const alias = host === "localhost" || host.endsWith(".localhost");
  const connect = (hostname: string) =>
    new Promise<IncomingMessage>((resolve, reject) => {
      const get = url.protocol === "https:" ? httpsGet : httpGet;
      get(
        {
          hostname,
          port: url.port,
          path: url.pathname + url.search,
          agent: false,
          signal,
          ...(alias && { servername: host }),
          rejectUnauthorized: true,
          headers: { Host: url.host, "Accept-Encoding": "identity" },
        },
        resolve
      ).once("error", reject);
    });
  try {
    return await connect(
      alias || host === "0.0.0.0" ? "127.0.0.1" : host.replace(/^\[|\]$/g, "")
    );
  } catch (error) {
    if (
      alias &&
      !signal.aborted &&
      (error as NodeJS.ErrnoException).code === "ECONNREFUSED"
    )
      return connect("::1");
    throw error;
  }
}

async function read(
  destination: string,
  signal: AbortSignal,
  budget: number,
  accept: (type: string) => boolean,
  prefix = false
): Promise<{ url: string; type: string; bytes: Buffer } | null> {
  // Verify at the request boundary as well as at the call site.
  const first = WebPreview.normalizeUrl(destination);
  if (!first) return null;
  const origin = new URL(first).origin;
  let url = first;
  try {
    for (let redirects = 0; redirects <= 2; redirects++) {
      const response = await request(new URL(url), signal);
      try {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          const location = response.headers.location;
          const next = location && sameOrigin(location, url, origin);
          if (!next) return null;
          url = next;
          continue;
        }
        const type =
          response.headers["content-type"]
            ?.split(";")[0]
            .trim()
            .toLowerCase() ?? "";
        if (
          response.statusCode !== 200 ||
          !accept(type) ||
          (response.headers["content-encoding"] ?? "identity") !== "identity" ||
          (!prefix && Number(response.headers["content-length"]) > budget)
        )
          return null;
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of response as AsyncIterable<Buffer>) {
          if (!prefix && chunk.length > budget - length) return null;
          const part = chunk.subarray(0, budget - length);
          chunks.push(part);
          length += part.length;
          if (prefix && length === budget) break;
        }
        return { url, type, bytes: Buffer.concat(chunks, length) };
      } finally {
        response.destroy();
      }
    }
  } catch {
    // Servers can be unavailable or stop responding mid-stream.
  }
  return null;
}

function elements(
  node?: Element | DefaultTreeAdapterTypes.Document
): Element[] {
  return (
    node?.childNodes.filter((child): child is Element => "tagName" in child) ??
    []
  );
}

function htmlHead(source: string): Element[] {
  const html = elements(parse(source)).find((node) => node.tagName === "html");
  return elements(elements(html).find((node) => node.tagName === "head"));
}

function attribute(node: Element | undefined, key: string): string | undefined {
  return node?.attrs.find(({ name }) => name === key)?.value;
}

export class WebPreviewService {
  readonly #providers = new Map<string, WebPreviewProvider>();
  readonly #pending = new Map<string, Pending>();
  readonly #cache = new Map<
    string,
    { scope: string; until: number; value: Result; iconSkipped: boolean }
  >();
  readonly #decoder = new BrowserFaviconDecoder();
  readonly #decode: BrowserFaviconDecoder["decode"];
  #active = 0;

  constructor(
    options: {
      providers?: readonly WebPreviewProvider[];
      decode?: BrowserFaviconDecoder["decode"];
    } = {}
  ) {
    this.#decode = options.decode ?? this.#decoder.decode;
    for (const provider of options.providers ?? []) this.register(provider);
  }

  register(provider: WebPreviewProvider): () => void {
    if (this.#providers.has(provider.id))
      throw new Error(`Duplicate web preview provider: ${provider.id}`);
    this.#providers.set(provider.id, provider);
    this.clear();
    return () => {
      if (this.#providers.get(provider.id) !== provider) return;
      this.#providers.delete(provider.id);
      this.clear();
    };
  }

  async lookup(
    scope: string,
    input: unknown,
    signal: AbortSignal,
    observed?: Result
  ): Promise<Result> {
    const url = WebPreview.normalizeUrl(input);
    if (!url || signal.aborted) return null;
    const key = JSON.stringify([scope, url]);
    const { title, favicon } = observed ?? {};
    const overlay = (value: Result): Result =>
      title || favicon
        ? { ...value, ...(title && { title }), ...(favicon && { favicon }) }
        : value;
    const cached = this.#cache.get(key);
    if (cached && cached.until > Date.now() && (!cached.iconSkipped || favicon))
      return overlay(cached.value);
    this.#cache.delete(key);

    let pending = this.#pending.get(key);
    if (!pending) {
      if (this.#pending.size >= 32) return overlay(null);
      const { promise, resolve } = Promise.withResolvers<Result>();
      pending = {
        scope,
        url,
        readers: 0,
        started: false,
        hasIcon: !!favicon,
        controller: new AbortController(),
        result: promise,
        resolve,
      };
      this.#pending.set(key, pending);
    }
    const shared = pending;
    shared.readers++;
    if (!favicon) shared.hasIcon = false;
    return new Promise((resolve) => {
      const release = () => {
        signal.removeEventListener("abort", abort);
        if (--shared.readers === 0 && this.#pending.get(key) === shared)
          this.#cancel(key, shared);
      };
      const abort = () => {
        release();
        resolve(null);
      };
      signal.addEventListener("abort", abort, { once: true });
      void shared.result.then((value) => {
        if (signal.aborted) return;
        release();
        resolve(shared.controller.signal.aborted ? null : overlay(value));
      });
      this.#pump();
    });
  }

  clear(scope?: string): void {
    for (const [key, item] of this.#pending) {
      if (scope === undefined || item.scope === scope) this.#cancel(key, item);
    }
    for (const [key, item] of this.#cache) {
      if (scope === undefined || item.scope === scope) this.#cache.delete(key);
    }
    if (scope === undefined) this.#decoder.close();
  }

  #cancel(key: string, pending: Pending): void {
    this.#pending.delete(key);
    pending.controller.abort();
    pending.resolve(null);
  }

  #pump(): void {
    for (const [key, pending] of this.#pending) {
      if (this.#active >= 2) return;
      if (pending.started) continue;
      pending.started = true;
      this.#active++;
      void this.#resolve(pending)
        .catch(() => null)
        .then((value) => {
          this.#active--;
          if (this.#pending.get(key) === pending) {
            this.#pending.delete(key);
            if (this.#cache.size >= 64)
              this.#cache.delete(this.#cache.keys().next().value!);
            this.#cache.set(key, {
              scope: pending.scope,
              until: Date.now() + (value ? 60_000 : 5_000),
              value,
              iconSkipped: pending.iconSkipped ?? false,
            });
            pending.resolve(value);
          }
          this.#pump();
        });
    }
  }

  async #resolve(pending: Pending): Promise<Result> {
    const signal = AbortSignal.any([
      pending.controller.signal,
      AbortSignal.timeout(1700),
    ]);
    const page = await read(
      pending.url,
      signal,
      HTML_BYTES,
      (type) => type === "text/html",
      true
    );
    if (!page || signal.aborted) return null;
    const head = htmlHead(page.bytes.toString("utf8"));
    const meta = head.filter((node) => node.tagName === "meta");
    const title = head.find((node) => node.tagName === "title");
    const description = meta.find(
      (node) => attribute(node, "name")?.toLowerCase() === "description"
    );
    const metadata = display(
      title?.childNodes
        .map((child) => ("value" in child ? child.value : ""))
        .join(""),
      attribute(description, "content")
    );
    const matches = [...this.#providers.values()].filter((provider) =>
      meta.some(
        (node) =>
          attribute(node, "name") === provider.match.meta &&
          Object.entries(provider.match.attributes).every(
            ([key, value]) => attribute(node, key) === value
          )
      )
    );
    const provider = matches.length === 1 ? matches[0] : undefined;
    pending.iconSkipped = pending.hasIcon;
    const [favicon, details] = await Promise.all([
      pending.iconSkipped ? null : this.#favicon(page.url, head, signal),
      provider?.resolve
        ? this.#details(provider, page.url, metadata, signal)
        : null,
    ]);
    const productLabel = text(
      provider?.resolve && !details ? undefined : provider?.productLabel,
      WebPreview.MAX_PRODUCT_LABEL
    );
    const result = {
      ...metadata,
      ...details,
      ...(favicon && { favicon }),
      ...(productLabel && { productLabel }),
    };
    return Object.keys(result).length ? result : null;
  }

  async #details(
    provider: WebPreviewProvider,
    url: string,
    metadata: Display,
    signal: AbortSignal
  ) {
    if (signal.aborted) return null;
    const origin = new URL(url).origin;
    let called = false;
    const lease = new AbortController();
    const providerSignal = AbortSignal.any([signal, lease.signal]);
    const abort = Promise.withResolvers<null>();
    const cancel = () => abort.resolve(null);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const work = provider.resolve?.({
        url,
        metadata,
        signal: providerSignal,
        read: async (path) => {
          if (called || providerSignal.aborted) return null;
          called = true;
          const destination = sameOrigin(path, url, origin);
          const response =
            destination &&
            (await read(
              destination,
              providerSignal,
              HTML_BYTES,
              (type) => type === "application/json" || type === "text/plain"
            ));
          return response ? response.bytes.toString("utf8") : null;
        },
      });
      const result = await Promise.race([work, abort.promise]);
      return result ? display(result.title, result.description) : null;
    } catch {
      return null;
    } finally {
      signal.removeEventListener("abort", cancel);
      lease.abort();
    }
  }

  async #favicon(url: string, head: Element[], signal: AbortSignal) {
    const origin = new URL(url).origin;
    const base = attribute(
      head.find(
        (node) =>
          node.tagName === "base" && attribute(node, "href") !== undefined
      ),
      "href"
    );
    let iconBase = url;
    try {
      if (base) iconBase = new URL(base, url).href;
    } catch {
      // An invalid base leaves relative links relative to the page.
    }
    let link: string | null = null;
    let hint: string | undefined;
    for (const node of head.toReversed()) {
      if (
        node.tagName !== "link" ||
        !attribute(node, "rel")?.toLowerCase().split(/\s+/).includes("icon")
      )
        continue;
      const type = attribute(node, "type")?.trim().toLowerCase();
      const href = attribute(node, "href")?.trim();
      if (
        attribute(node, "media") ||
        !href ||
        (type && !ICON_MIME_TYPES.includes(type))
      )
        continue;
      link = sameOrigin(href, iconBase, origin);
      if (!link) continue;
      hint = type;
      break;
    }
    const target = link ?? new URL("/favicon.ico", origin).href;
    const response = await read(
      target,
      signal,
      DesktopBrowser.MAX_FAVICON_BYTES,
      (type) =>
        !type ||
        type === "application/octet-stream" ||
        ICON_MIME_TYPES.includes(type)
    );
    if (!response || signal.aborted || !response.bytes.length) return null;
    const base64 = response.bytes.toString("base64");
    const type = ICON_MIME_TYPES.includes(response.type)
      ? response.type
      : (hint ??
        (new URL(response.url).pathname.toLowerCase().endsWith(".svg")
          ? "image/svg+xml"
          : DesktopBrowser.FAVICON_MIME_TYPES.find((mime) =>
              DesktopBrowser.parseFavicon({
                dataUrl: `data:${mime};base64,${base64}`,
              })
            )));
    return type
      ? this.#decode(`data:${type};base64,${base64}`, signal).catch(() => null)
      : null;
  }
}
