import type { WebPreview } from "./web-preview";

/**
 * GRIDA-SEC-016 — bounded native browser values and destination validation.
 * DTO validation establishes no caller or guest authority.
 */
export namespace DesktopBrowser {
  export const VERSION = 4 as const;
  export const MAX_PAGES = 64;
  export const MAX_URL_BYTES = 8192;
  export const MAX_TITLE_BYTES = 1024;
  export const MAX_FAILURE_MESSAGE_BYTES = 2048;
  export const MOUNT_URL_PREFIX = "about:blank#grida-browser-mount=" as const;
  export const MAX_THUMBNAIL_WIDTH = 320;
  export const MAX_THUMBNAIL_HEIGHT = 180;
  export const MAX_THUMBNAIL_BYTES = 64 * 1024;
  export const MAX_FAVICON_EDGE = 256;
  export const MAX_FAVICON_BYTES = 64 * 1024;
  export const FAVICON_MIME_TYPES = Object.freeze([
    "image/png",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ] as const);

  export type Target = Readonly<{ attachmentId: string; pageId: string }>;
  export type Presentation = Target & Readonly<{ focus: boolean }>;
  export type Create = Readonly<{
    attachmentId: string;
    /** Omission creates a blank page. An empty or invalid URL rejects. */
    url?: string;
  }>;
  export type Navigate = Target & Readonly<{ url: string }>;
  /** Transient native-issued admission claim, passed unchanged to the guest. */
  export type GuestMount = Readonly<{ src: string }>;
  /** Bounded, untrusted pixels of a page's best-effort last rendered viewport. */
  export type Thumbnail = Readonly<{
    /** JPEG only; no URLs, paths, scripts or image-loading options. */
    dataUrl: string;
    width: number;
    height: number;
  }>;
  /** Transient, untrusted raster bytes; never a remote page resource URL. */
  export type Favicon = Readonly<{ dataUrl: string }>;
  export type Failure = Readonly<{
    kind: "mount" | "navigation" | "renderer-gone";
    /** Bounded public classification, never an exception or upstream body. */
    code: string;
    message: string;
  }>;
  export type Page = Readonly<{
    id: string;
    /** An actual registered guest exists; a descriptor alone is not mounted. */
    mounted: boolean;
    /** Owner revision at which this page last changed. */
    revision: number;
    /**
     * Bounded transient live location, validated by normalizeLocation. Null is
     * intentionally blank. Persist/restore only normalizeUrl-approved HTTP(S).
     */
    url: string | null;
    title: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    focused: boolean;
    failure: Failure | null;
  }>;
  export type Snapshot = Readonly<{
    version: typeof VERSION;
    /** Native-issued and bound to one top-level document generation. */
    attachmentId: string;
    /** Monotonic owner revision; zero is valid for an empty owner. */
    revision: number;
    pages: readonly Page[];
  }>;
  export type Event =
    | Readonly<{
        /** Main created a page; this outcome does not grant page authority. */
        type: "created";
        attachmentId: string;
        revision: number;
        page: Page;
        /** Opaque page identity in the same attachment, or no retained opener. */
        openerPageId: string | null;
        disposition: "foreground" | "background";
      }>
    | Readonly<{
        type: "changed";
        attachmentId: string;
        revision: number;
        page: Page;
      }>
    | Readonly<{
        type: "closed";
        attachmentId: string;
        revision: number;
        pageId: string;
      }>;

  /** Shared native history, independent of page ownership and page revisions. */
  export namespace History {
    export const VERSION = 1 as const;
    export const MAX_QUERY_BYTES = 512;
    export const MAX_RESULTS = 100;

    export type Entry = Readonly<{
      /** Canonical absolute HTTP(S) URL; this is the exact removal identity. */
      url: string;
      /** Untrusted plain text, bounded by the ordinary page-title limit. */
      title: string;
      /** Unix milliseconds within the JavaScript Date range. */
      lastVisitedAt: number;
    }>;
    export type Query = Readonly<{
      /** Trimmed case-insensitive URL/title substring; blank means recent. */
      query: string;
      /** Positive integer, at most MAX_RESULTS. */
      limit: number;
    }>;
    export type Removal = Readonly<{ url: string }>;
    export type Snapshot = Readonly<{
      version: typeof VERSION;
      /** Monotonic collection revision within the current native lifetime. */
      revision: number;
      /** Unique URLs, newest visit first, then URL in ascending code-unit order. */
      entries: readonly Entry[];
    }>;
    /** Invalidation only; reread instead of inferring the changed entry. */
    export type Change = Readonly<{ revision: number }>;

    export interface Bridge {
      readonly version: typeof VERSION;
      /** Exact native admission is required; no page attachment is needed. */
      query(request: Query): Promise<Snapshot>;
      /** Removes only the exact URL; absent URLs succeed without a change. */
      remove(request: Removal): Promise<void>;
      /** Subscribe before reading; discard responses older than a seen change. */
      subscribe(handler: (change: Change) => void): () => void;
    }

    export function parseQuery(value: unknown): Query | null {
      if (
        !record(value) ||
        !keys(value, ["query", "limit"]) ||
        !text(value.query, MAX_QUERY_BYTES) ||
        typeof value.limit !== "number" ||
        !Number.isInteger(value.limit) ||
        value.limit < 1 ||
        value.limit > MAX_RESULTS
      )
        return null;
      return Object.freeze({ query: value.query, limit: value.limit });
    }

    export function parseRemoval(value: unknown): Removal | null {
      if (
        !record(value) ||
        !keys(value, ["url"]) ||
        typeof value.url !== "string" ||
        normalizeUrl(value.url) !== value.url
      )
        return null;
      return Object.freeze({ url: value.url });
    }

    export function parseEntry(value: unknown): Entry | null {
      if (
        !record(value) ||
        !keys(value, ["url", "title", "lastVisitedAt"]) ||
        typeof value.url !== "string" ||
        normalizeUrl(value.url) !== value.url ||
        !text(value.title, MAX_TITLE_BYTES) ||
        typeof value.lastVisitedAt !== "number" ||
        !Number.isSafeInteger(value.lastVisitedAt) ||
        value.lastVisitedAt < 0 ||
        value.lastVisitedAt > 8_640_000_000_000_000
      )
        return null;
      return Object.freeze({
        url: value.url,
        title: value.title,
        lastVisitedAt: value.lastVisitedAt,
      });
    }

    export function parseSnapshot(value: unknown): Snapshot | null {
      if (
        !record(value) ||
        !keys(value, ["version", "revision", "entries"]) ||
        value.version !== VERSION ||
        !isRevision(value.revision) ||
        !Array.isArray(value.entries) ||
        value.entries.length > MAX_RESULTS
      )
        return null;
      const entries: Entry[] = [];
      const urls = new Set<string>();
      for (const input of value.entries) {
        const entry = parseEntry(input);
        if (!entry || urls.has(entry.url)) return null;
        const previous = entries.at(-1);
        if (
          previous &&
          (previous.lastVisitedAt < entry.lastVisitedAt ||
            (previous.lastVisitedAt === entry.lastVisitedAt &&
              previous.url > entry.url))
        )
          return null;
        urls.add(entry.url);
        entries.push(entry);
      }
      return Object.freeze({
        version: VERSION,
        revision: value.revision,
        entries: Object.freeze(entries),
      });
    }

    export function parseChange(value: unknown): Change | null {
      if (
        !record(value) ||
        !keys(value, ["revision"]) ||
        !isRevision(value.revision) ||
        value.revision === 0
      )
        return null;
      return Object.freeze({ revision: value.revision });
    }
  }

  /** Optional purpose-specific page tools; never a script/debugger transport. */
  export namespace Utilities {
    export const VERSION = 1 as const;
    export const MAX_FIND_BYTES = 1024;
    export const MIN_ZOOM_FACTOR = 0.25;
    export const MAX_ZOOM_FACTOR = 5;

    export type Find = Target &
      Readonly<{
        text: string;
        forward: boolean;
        findNext: boolean;
        matchCase: boolean;
      }>;
    /** Final native result for this request, without geometry or native IDs. */
    export type FindResult = Readonly<{
      matches: number;
      /** One-based; zero when no result is active. */
      activeMatchOrdinal: number;
    }>;
    export type Zoom = Target & Readonly<{ factor: number }>;

    export interface Bridge {
      readonly version: typeof VERSION;
      find(request: Find): Promise<FindResult>;
      /** Ends finding and clears its selection. */
      stopFind(request: Target): Promise<void>;
      getZoom(request: Target): Promise<number>;
      setZoom(request: Zoom): Promise<number>;
      /** Opens Chromium's ordinary print UI for the owned page. */
      print(request: Target): Promise<void>;
      /** Opens the owned page's native DevTools; accepts no debugger commands. */
      inspect(request: Target): Promise<void>;
    }

    export function parseFind(value: unknown): Find | null {
      if (
        !record(value) ||
        !keys(value, [
          "attachmentId",
          "pageId",
          "text",
          "forward",
          "findNext",
          "matchCase",
        ]) ||
        !isIdentity(value.attachmentId) ||
        !isIdentity(value.pageId) ||
        !text(value.text, MAX_FIND_BYTES) ||
        value.text.length === 0 ||
        typeof value.forward !== "boolean" ||
        typeof value.findNext !== "boolean" ||
        typeof value.matchCase !== "boolean"
      )
        return null;
      return Object.freeze({
        attachmentId: value.attachmentId,
        pageId: value.pageId,
        text: value.text,
        forward: value.forward,
        findNext: value.findNext,
        matchCase: value.matchCase,
      });
    }

    export function parseFindResult(value: unknown): FindResult | null {
      if (
        !record(value) ||
        !keys(value, ["matches", "activeMatchOrdinal"]) ||
        !isRevision(value.matches) ||
        !isRevision(value.activeMatchOrdinal) ||
        value.activeMatchOrdinal > value.matches
      )
        return null;
      return Object.freeze({
        matches: value.matches,
        activeMatchOrdinal: value.activeMatchOrdinal,
      });
    }

    export function parseZoomFactor(value: unknown): number | null {
      return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= MIN_ZOOM_FACTOR &&
        value <= MAX_ZOOM_FACTOR
        ? value
        : null;
    }

    export function parseZoom(value: unknown): Zoom | null {
      if (
        !record(value) ||
        !keys(value, ["attachmentId", "pageId", "factor"]) ||
        !isIdentity(value.attachmentId) ||
        !isIdentity(value.pageId) ||
        parseZoomFactor(value.factor) === null
      )
        return null;
      return Object.freeze({
        attachmentId: value.attachmentId,
        pageId: value.pageId,
        factor: value.factor as number,
      });
    }
  }

  /** Optional global browser settings; no selectors for paths or permissions. */
  export namespace Management {
    export const VERSION = 1 as const;
    export const MAX_DIRECTORY_NAME_BYTES = 256;

    export type DownloadPreferences = Readonly<{
      askBeforeDownload: boolean;
      /** Display-only native folder basename; null uses the system default. */
      directoryName: string | null;
    }>;
    export type DownloadPrompt = Readonly<{ askBeforeDownload: boolean }>;
    export type OpenPage = Readonly<{
      /** Exact canonical HTTP(S) destination; never a generated live location. */
      url: string;
    }>;

    export interface Bridge {
      readonly version: typeof VERSION;
      /** Clears shared recorded visits only; preserves website state/cache. */
      clearHistory(): Promise<boolean>;
      /** Clears shared HTTP cache only; preserves history and website sign-ins. */
      clearCache(): Promise<boolean>;
      /** Revokes browser site permission grants, never account/provider grants. */
      resetPermissions(): Promise<boolean>;
      downloadPreferences(): Promise<DownloadPreferences>;
      setDownloadPrompt(request: DownloadPrompt): Promise<DownloadPreferences>;
      /** Native directory chooser only; null means the user cancelled. */
      chooseDownloadDirectory(): Promise<DownloadPreferences | null>;
      /**
       * Requests a new page in an existing admitted workbench. False means no
       * eligible workbench is available. Grants no attachment/page authority.
       */
      openPage?(request: OpenPage): Promise<boolean>;
    }

    export function parseDownloadPreferences(
      value: unknown
    ): DownloadPreferences | null {
      if (
        !record(value) ||
        !keys(value, ["askBeforeDownload", "directoryName"]) ||
        typeof value.askBeforeDownload !== "boolean" ||
        (value.directoryName !== null &&
          (!text(value.directoryName, MAX_DIRECTORY_NAME_BYTES) ||
            value.directoryName.length === 0 ||
            value.directoryName.trim() !== value.directoryName ||
            /[/\\]/.test(value.directoryName) ||
            value.directoryName === "." ||
            value.directoryName === ".."))
      )
        return null;
      return Object.freeze({
        askBeforeDownload: value.askBeforeDownload,
        directoryName: value.directoryName as string | null,
      });
    }

    export function parseDownloadPrompt(value: unknown): DownloadPrompt | null {
      if (
        !record(value) ||
        !keys(value, ["askBeforeDownload"]) ||
        typeof value.askBeforeDownload !== "boolean"
      )
        return null;
      return Object.freeze({ askBeforeDownload: value.askBeforeDownload });
    }

    export function parseOpenPage(value: unknown): OpenPage | null {
      if (
        !record(value) ||
        !keys(value, ["url"]) ||
        typeof value.url !== "string" ||
        normalizeUrl(value.url) !== value.url
      )
        return null;
      return Object.freeze({ url: value.url });
    }
  }

  export interface Bridge {
    readonly version: typeof VERSION;
    readonly presentation: "webview";
    /** Optional versioned shared history; absence does not disable pages. */
    readonly history?: History.Bridge;
    readonly utilities?: Utilities.Bridge;
    readonly management?: Management.Bridge;
    /** Workspace identity authorizes page ownership; it never selects storage. */
    attach(workspaceId: string): Promise<Snapshot>;
    snapshot(attachmentId: string): Promise<Snapshot>;
    /** Ends this document's pages and guests, preserving browser profile data. */
    detach(attachmentId: string): Promise<void>;
    create(request: Create): Promise<Page>;
    /**
     * Reserves a one-use mount for an unmounted page in this document.
     * Page.mounted becomes true only after Main registers the actual guest.
     */
    reserveMount(request: Target): Promise<GuestMount>;
    /** Input/focus eligibility only. DOM presentation owns geometry/visibility. */
    setActive(request: Target & Readonly<{ active: boolean }>): Promise<void>;
    navigate(request: Navigate): Promise<void>;
    back(request: Target): Promise<void>;
    forward(request: Target): Promise<void>;
    reload(request: Target): Promise<void>;
    stop(request: Target): Promise<void>;
    focus(request: Target): Promise<void>;
    /** False keeps the page after a user cancellation; true means it closed. */
    close(request: Target): Promise<boolean>;
    /** Opens only this page's current, native-validated HTTP(S) URL. */
    openExternal(request: Target): Promise<void>;
    /**
     * Optional on older hosts. Explicit thumbnail read without showing,
     * focusing or navigating the page; unavailable captures resolve as null.
     */
    thumbnail?(request: Target): Promise<Thumbnail | null>;
    /** Optional enrichment; stable reads do not emit another page outcome. */
    favicon?(request: Target): Promise<Favicon | null>;
    /** Optional, document-bound loopback metadata for an on-screen link. */
    preview?(request: WebPreview.Request): Promise<WebPreview.Metadata | null>;
    cancelPreview?(request: WebPreview.Cancel): Promise<void>;
    /**
     * Native confirms clearing the app-wide browser profile from an admitted
     * workspace or Settings document, then rechecks its generation. False is
     * cancellation; true means clearing completed. Other failures reject.
     * This takes no profile/workspace selector and grants no page authority.
     */
    clearBrowsingData(): Promise<boolean>;
    /** Subscribe before attaching/reading; revision gaps require a snapshot. */
    subscribe(handler: (event: Event) => void): () => void;
    subscribePresentation?(
      handler: (request: Presentation) => void
    ): () => void;
  }

  export function parsePresentation(value: unknown): Presentation | null {
    if (
      !record(value) ||
      !keys(value, ["attachmentId", "pageId", "focus"]) ||
      !isIdentity(value.attachmentId) ||
      !isIdentity(value.pageId) ||
      typeof value.focus !== "boolean"
    )
      return null;
    return {
      attachmentId: value.attachmentId,
      pageId: value.pageId,
      focus: value.focus,
    };
  }

  const encoder = new TextEncoder();
  const controls = /[\p{Cc}\p{Cs}]/u;

  function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function keys(value: Record<string, unknown>, expected: readonly string[]) {
    const actual = Object.keys(value);
    return (
      actual.length === expected.length &&
      expected.every((k) => Object.hasOwn(value, k))
    );
  }

  function text(value: unknown, maxBytes: number): value is string {
    return (
      typeof value === "string" &&
      value.length <= maxBytes &&
      !controls.test(value) &&
      encoder.encode(value).byteLength <= maxBytes
    );
  }

  /** Syntax only. A valid identity does not grant access to a page or owner. */
  export function isIdentity(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  }

  export function isRevision(value: unknown): value is number {
    return (
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    );
  }

  /** HTTP(S) only, with no credentials or control characters. No scheme guessing. */
  export function normalizeUrl(value: unknown): string | null {
    if (
      !text(value, MAX_URL_BYTES) ||
      value.trim() !== value ||
      value.includes("\\") ||
      !/^https?:\/\/[^/?#]+/i.test(value) ||
      /^https?:\/\/[^/?#]*@/i.test(value)
    )
      return null;
    try {
      const url = new URL(value);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        !url.hostname ||
        url.username ||
        url.password ||
        encoder.encode(url.href).byteLength > MAX_URL_BYTES
      )
        return null;
      return url.href;
    } catch {
      return null;
    }
  }

  /**
   * Transient website location metadata only, never navigation/fetch/file
   * authority. Generated locations must not enter history or restoration.
   * Hosts may use `data:` when a full generated URL exceeds the display bound.
   */
  export function normalizeLocation(value: unknown): string | null {
    const web = normalizeUrl(value);
    if (web !== null) return web;
    if (
      !text(value, MAX_URL_BYTES) ||
      value.trim() !== value ||
      value.startsWith(MOUNT_URL_PREFIX)
    )
      return null;
    if (/^about:(?:blank|srcdoc)(?:[?#].*)?$/.test(value)) return value;
    if (value.startsWith("data:")) {
      if (value !== "data:" && !value.includes(",")) return null;
      return value;
    }
    if (value.startsWith("blob:")) {
      const inner = value.slice(5);
      if (/^null\/[A-Za-z0-9_-]{1,128}(?:[?#].*)?$/.test(inner)) return value;
      const origin = normalizeUrl(inner);
      if (origin !== null && new URL(origin).pathname !== "/")
        return `blob:${origin}`;
    }
    return null;
  }

  /** Validates only the bounded bootstrap shape; Main still owns admission. */
  export function parseGuestMount(value: unknown): GuestMount | null {
    if (
      !record(value) ||
      !keys(value, ["src"]) ||
      typeof value.src !== "string" ||
      value.src.length > MOUNT_URL_PREFIX.length + 128 ||
      !value.src.startsWith(MOUNT_URL_PREFIX) ||
      !isIdentity(value.src.slice(MOUNT_URL_PREFIX.length))
    )
      return null;
    return Object.freeze({ src: value.src });
  }

  /** Raster container/dimension checks only; decoding belongs in a sandbox. */
  export function parseFavicon(value: unknown): Favicon | null {
    if (
      !record(value) ||
      !keys(value, ["dataUrl"]) ||
      typeof value.dataUrl !== "string" ||
      value.dataUrl.length > 64 + 4 * Math.ceil(MAX_FAVICON_BYTES / 3)
    )
      return null;
    const dataUrl = value.dataUrl;
    const mime = FAVICON_MIME_TYPES.find((candidate) =>
      dataUrl.startsWith(`data:${candidate};base64,`)
    );
    if (!mime) return null;
    const bytes = imageBytes(
      dataUrl.slice(`data:${mime};base64,`.length),
      MAX_FAVICON_BYTES
    );
    if (!bytes) return null;
    const valid =
      mime === "image/x-icon" || mime === "image/vnd.microsoft.icon"
        ? ico(bytes)
        : iconSize(
            mime === "image/png"
              ? pngSize(bytes)
              : mime === "image/jpeg"
                ? jpegSize(bytes)
                : mime === "image/webp"
                  ? webpSize(bytes)
                  : gifSize(bytes)
          );
    return valid ? Object.freeze({ dataUrl }) : null;
  }

  function imageBytes(encoded: string, maxBytes: number): string | null {
    if (
      !encoded ||
      encoded.length > 4 * Math.ceil(maxBytes / 3) ||
      encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded
      )
    )
      return null;
    try {
      const bytes = atob(encoded);
      return bytes.length <= maxBytes && btoa(bytes) === encoded ? bytes : null;
    } catch {
      return null;
    }
  }

  type ImageSize = { width: number; height: number };

  function iconSize(size: ImageSize | null): boolean {
    return (
      size !== null &&
      Number.isInteger(size.width) &&
      Number.isInteger(size.height) &&
      size.width > 0 &&
      size.height > 0 &&
      size.width <= MAX_FAVICON_EDGE &&
      size.height <= MAX_FAVICON_EDGE
    );
  }

  function uint(
    bytes: string,
    offset: number,
    length: number,
    little = true
  ): number {
    if (offset < 0 || offset + length > bytes.length) return NaN;
    let result = 0;
    for (let i = 0; i < length; i++)
      result =
        result * 256 + bytes.charCodeAt(offset + (little ? length - i - 1 : i));
    return result;
  }

  function pngSize(bytes: string): ImageSize | null {
    if (!bytes.startsWith("\x89PNG\r\n\x1a\n")) return null;
    let offset = 8;
    let size: ImageSize | null = null;
    let image = false;
    while (offset + 12 <= bytes.length) {
      const length = uint(bytes, offset, 4, false);
      const type = bytes.slice(offset + 4, offset + 8);
      const data = offset + 8;
      if (data + length + 4 > bytes.length || !/^[A-Za-z]{4}$/.test(type))
        return null;
      if (!size) {
        if (type !== "IHDR" || length !== 13) return null;
        size = {
          width: uint(bytes, data, 4, false),
          height: uint(bytes, data + 4, 4, false),
        };
        const depth = bytes.charCodeAt(data + 8);
        const color = bytes.charCodeAt(data + 9);
        if (
          !iconSize(size) ||
          !(
            (color === 0 && [1, 2, 4, 8, 16].includes(depth)) ||
            (color === 3 && [1, 2, 4, 8].includes(depth)) ||
            ([2, 4, 6].includes(color) && [8, 16].includes(depth))
          ) ||
          bytes.charCodeAt(data + 10) !== 0 ||
          bytes.charCodeAt(data + 11) !== 0 ||
          bytes.charCodeAt(data + 12) > 1
        )
          return null;
      } else if (type === "IEND") {
        return length === 0 && image && data + 4 === bytes.length ? size : null;
      } else if (type === "IDAT") {
        image ||= length > 0;
      } else if (
        type === "IHDR" ||
        ["acTL", "fcTL", "fdAT"].includes(type) ||
        (type[0] === type[0].toUpperCase() && type !== "PLTE")
      )
        return null;
      offset = data + length + 4;
    }
    return null;
  }

  function ico(bytes: string): boolean {
    const count = uint(bytes, 4, 2);
    if (
      bytes.length < 6 ||
      uint(bytes, 0, 2) !== 0 ||
      uint(bytes, 2, 2) !== 1 ||
      count < 1 ||
      count > 16 ||
      6 + 16 * count > bytes.length
    )
      return false;
    for (let i = 0; i < count; i++) {
      const entry = 6 + 16 * i;
      const width = bytes.charCodeAt(entry) || 256;
      const height = bytes.charCodeAt(entry + 1) || 256;
      const length = uint(bytes, entry + 8, 4);
      const offset = uint(bytes, entry + 12, 4);
      if (
        bytes.charCodeAt(entry + 3) !== 0 ||
        ![0, 1].includes(uint(bytes, entry + 4, 2)) ||
        ![0, 1, 4, 8, 16, 24, 32].includes(uint(bytes, entry + 6, 2)) ||
        length === 0 ||
        offset < 6 + 16 * count ||
        offset + length > bytes.length
      )
        return false;
      const image = bytes.slice(offset, offset + length);
      if (image.startsWith("\x89PNG")) {
        const size = pngSize(image);
        if (!size || size.width !== width || size.height !== height)
          return false;
      } else {
        const depth = uint(image, 14, 2);
        const colors = depth <= 8 ? uint(image, 32, 4) || 2 ** depth : 0;
        const pixels = Math.ceil((width * depth) / 32) * 4 * height;
        const mask = depth === 32 ? 0 : Math.ceil(width / 32) * 4 * height;
        if (
          uint(image, 0, 4) !== 40 ||
          uint(image, 4, 4) !== width ||
          uint(image, 8, 4) !== height * 2 ||
          uint(image, 12, 2) !== 1 ||
          ![1, 4, 8, 16, 24, 32].includes(depth) ||
          uint(image, 16, 4) !== 0 ||
          colors > 2 ** depth ||
          40 + colors * 4 + pixels + mask > image.length
        )
          return false;
      }
    }
    return true;
  }

  function webpSize(bytes: string): ImageSize | null {
    if (
      !bytes.startsWith("RIFF") ||
      bytes.slice(8, 12) !== "WEBP" ||
      uint(bytes, 4, 4) + 8 !== bytes.length
    )
      return null;
    let offset = 12;
    let canvas: ImageSize | null = null;
    let frame: ImageSize | null = null;
    while (offset + 8 <= bytes.length) {
      const type = bytes.slice(offset, offset + 4);
      const length = uint(bytes, offset + 4, 4);
      const data = offset + 8;
      if (
        data + length + (length % 2) > bytes.length ||
        type === "ANIM" ||
        type === "ANMF"
      )
        return null;
      if (type === "VP8X") {
        if (
          offset !== 12 ||
          length !== 10 ||
          (bytes.charCodeAt(data) & 2) !== 0
        )
          return null;
        canvas = {
          width: uint(bytes, data + 4, 3) + 1,
          height: uint(bytes, data + 7, 3) + 1,
        };
      } else if (type === "VP8 ") {
        if (
          frame ||
          length <= 10 ||
          (bytes.charCodeAt(data) & 1) !== 0 ||
          bytes.slice(data + 3, data + 6) !== "\x9d\x01\x2a"
        )
          return null;
        frame = {
          width: uint(bytes, data + 6, 2) & 0x3fff,
          height: uint(bytes, data + 8, 2) & 0x3fff,
        };
      } else if (type === "VP8L") {
        const bits = uint(bytes, data + 1, 4);
        if (
          frame ||
          length <= 5 ||
          bytes.charCodeAt(data) !== 0x2f ||
          bits >>> 29 !== 0
        )
          return null;
        frame = {
          width: (bits & 0x3fff) + 1,
          height: ((bits >>> 14) & 0x3fff) + 1,
        };
      }
      offset = data + length + (length % 2);
    }
    return offset === bytes.length &&
      frame &&
      (!canvas ||
        (canvas.width === frame.width && canvas.height === frame.height))
      ? frame
      : null;
  }

  function gifSize(bytes: string): ImageSize | null {
    if (!["GIF87a", "GIF89a"].includes(bytes.slice(0, 6)) || bytes.length < 14)
      return null;
    const size = { width: uint(bytes, 6, 2), height: uint(bytes, 8, 2) };
    if (!iconSize(size)) return null;
    let offset = 13;
    if ((bytes.charCodeAt(10) & 0x80) !== 0)
      offset += 3 * (2 << (bytes.charCodeAt(10) & 7));
    let images = 0;
    const blocks = () => {
      while (offset < bytes.length) {
        const length = bytes.charCodeAt(offset++);
        if (length === 0) return true;
        offset += length;
      }
      return false;
    };
    while (offset < bytes.length) {
      const marker = bytes.charCodeAt(offset++);
      if (marker === 0x3b)
        return images === 1 && offset === bytes.length ? size : null;
      if (marker === 0x21) {
        const label = bytes.charCodeAt(offset++);
        if (label === 0xf9) {
          if (
            bytes.charCodeAt(offset) !== 4 ||
            bytes.charCodeAt(offset + 5) !== 0
          )
            return null;
          offset += 6;
        } else if (
          ![0xfe, 0xff].includes(label) ||
          (label === 0xff && bytes.charCodeAt(offset) !== 11) ||
          !blocks()
        )
          return null;
      } else if (marker === 0x2c) {
        if (++images > 1 || offset + 9 > bytes.length) return null;
        const width = uint(bytes, offset + 4, 2);
        const height = uint(bytes, offset + 6, 2);
        if (
          width < 1 ||
          height < 1 ||
          uint(bytes, offset, 2) + width > size.width ||
          uint(bytes, offset + 2, 2) + height > size.height
        )
          return null;
        const flags = bytes.charCodeAt(offset + 8);
        offset += 9 + ((flags & 0x80) !== 0 ? 3 * (2 << (flags & 7)) : 0);
        const depth = bytes.charCodeAt(offset++);
        if (
          depth < 2 ||
          depth > 8 ||
          !(bytes.charCodeAt(offset) > 0) ||
          !blocks()
        )
          return null;
      } else return null;
    }
    return null;
  }

  /** Accepts a bounded JPEG projection and verifies its encoded dimensions. */
  export function parseThumbnail(value: unknown): Thumbnail | null {
    if (
      !record(value) ||
      !keys(value, ["dataUrl", "width", "height"]) ||
      typeof value.width !== "number" ||
      !Number.isInteger(value.width) ||
      value.width < 1 ||
      value.width > MAX_THUMBNAIL_WIDTH ||
      typeof value.height !== "number" ||
      !Number.isInteger(value.height) ||
      value.height < 1 ||
      value.height > MAX_THUMBNAIL_HEIGHT ||
      typeof value.dataUrl !== "string"
    )
      return null;
    const prefix = "data:image/jpeg;base64,";
    const maxBase64 = 4 * Math.ceil(MAX_THUMBNAIL_BYTES / 3);
    if (
      value.dataUrl.length > prefix.length + maxBase64 ||
      !value.dataUrl.startsWith(prefix)
    )
      return null;
    const encoded = value.dataUrl.slice(prefix.length);
    if (
      !encoded ||
      encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded
      )
    )
      return null;
    try {
      const bytes = atob(encoded);
      if (bytes.length > MAX_THUMBNAIL_BYTES || btoa(bytes) !== encoded)
        return null;
      const size = jpegSize(bytes);
      if (!size || size.width !== value.width || size.height !== value.height)
        return null;
    } catch {
      return null;
    }
    return Object.freeze({
      dataUrl: value.dataUrl,
      width: value.width,
      height: value.height,
    });
  }

  /** Header validation for 8-bit baseline/progressive JPEG images. */
  function jpegSize(bytes: string): { width: number; height: number } | null {
    const byte = (offset: number) => bytes.charCodeAt(offset);
    if (
      bytes.length < 4 ||
      byte(0) !== 0xff ||
      byte(1) !== 0xd8 ||
      byte(bytes.length - 2) !== 0xff ||
      byte(bytes.length - 1) !== 0xd9
    )
      return null;
    let offset = 2;
    let size: { width: number; height: number } | null = null;
    while (offset < bytes.length - 2) {
      if (byte(offset++) !== 0xff) return null;
      while (byte(offset) === 0xff) offset++;
      const marker = byte(offset++);
      if (marker === 0 || marker === 1 || (marker >= 0xd0 && marker <= 0xd9))
        return null;
      const length = byte(offset) * 256 + byte(offset + 1);
      if (
        length < 2 ||
        !Number.isInteger(length) ||
        offset + length > bytes.length - 2
      )
        return null;
      if (marker === 0xda) {
        // A scan must follow a bounded frame and retain room for image data.
        return size && length >= 6 && offset + length < bytes.length - 2
          ? size
          : null;
      }
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        const components = byte(offset + 7);
        if (
          size ||
          (marker !== 0xc0 && marker !== 0xc2) ||
          byte(offset + 2) !== 8 ||
          (components !== 1 && components !== 3) ||
          length !== 8 + 3 * components
        )
          return null;
        size = {
          height: byte(offset + 3) * 256 + byte(offset + 4),
          width: byte(offset + 5) * 256 + byte(offset + 6),
        };
      }
      offset += length;
    }
    return null;
  }

  export function parseFailure(value: unknown): Failure | null {
    if (
      !record(value) ||
      !keys(value, ["kind", "code", "message"]) ||
      (value.kind !== "mount" &&
        value.kind !== "navigation" &&
        value.kind !== "renderer-gone") ||
      !text(value.code, 64) ||
      value.code.length === 0 ||
      !text(value.message, MAX_FAILURE_MESSAGE_BYTES)
    )
      return null;
    return Object.freeze({
      kind: value.kind,
      code: value.code,
      message: value.message,
    });
  }

  /** Accepts only the bounded, path-free page projection. Metadata is untrusted. */
  export function parsePage(value: unknown): Page | null {
    if (
      !record(value) ||
      !keys(value, [
        "id",
        "mounted",
        "revision",
        "url",
        "title",
        "loading",
        "canGoBack",
        "canGoForward",
        "focused",
        "failure",
      ]) ||
      !isIdentity(value.id) ||
      typeof value.mounted !== "boolean" ||
      !isRevision(value.revision) ||
      value.revision === 0 ||
      (value.url !== null && normalizeLocation(value.url) === null) ||
      !text(value.title, MAX_TITLE_BYTES) ||
      typeof value.loading !== "boolean" ||
      typeof value.canGoBack !== "boolean" ||
      typeof value.canGoForward !== "boolean" ||
      typeof value.focused !== "boolean"
    )
      return null;
    const failure = value.failure === null ? null : parseFailure(value.failure);
    if (value.failure !== null && failure === null) return null;
    return Object.freeze({
      id: value.id,
      mounted: value.mounted,
      revision: value.revision,
      url: value.url as string | null,
      title: value.title,
      loading: value.loading,
      canGoBack: value.canGoBack,
      canGoForward: value.canGoForward,
      focused: value.focused,
      failure,
    });
  }

  export function parseSnapshot(value: unknown): Snapshot | null {
    if (
      !record(value) ||
      !keys(value, ["version", "attachmentId", "revision", "pages"]) ||
      value.version !== VERSION ||
      !isIdentity(value.attachmentId) ||
      !isRevision(value.revision) ||
      !Array.isArray(value.pages) ||
      value.pages.length > MAX_PAGES
    )
      return null;
    const pages: Page[] = [];
    for (const input of value.pages) {
      const page = parsePage(input);
      if (
        page === null ||
        page.revision > value.revision ||
        pages.some((p) => p.id === page.id) ||
        (page.focused && pages.some((p) => p.focused))
      )
        return null;
      pages.push(page);
    }
    return Object.freeze({
      version: VERSION,
      attachmentId: value.attachmentId,
      revision: value.revision,
      pages: Object.freeze(pages),
    });
  }

  export function parseEvent(value: unknown): Event | null {
    if (
      !record(value) ||
      !isIdentity(value.attachmentId) ||
      !isRevision(value.revision) ||
      value.revision === 0
    )
      return null;
    if (
      value.type === "closed" &&
      keys(value, ["type", "attachmentId", "revision", "pageId"]) &&
      isIdentity(value.pageId)
    )
      return Object.freeze({
        type: "closed",
        attachmentId: value.attachmentId,
        revision: value.revision,
        pageId: value.pageId,
      });
    if (value.type !== "changed" && value.type !== "created") return null;
    if (
      !keys(
        value,
        value.type === "created"
          ? [
              "type",
              "attachmentId",
              "revision",
              "page",
              "openerPageId",
              "disposition",
            ]
          : ["type", "attachmentId", "revision", "page"]
      )
    )
      return null;
    const page = parsePage(value.page);
    if (page === null || page.revision !== value.revision) return null;
    if (value.type === "created") {
      if (
        (value.openerPageId !== null &&
          (!isIdentity(value.openerPageId) ||
            value.openerPageId === page.id)) ||
        (value.disposition !== "foreground" &&
          value.disposition !== "background")
      )
        return null;
      return Object.freeze({
        type: "created",
        attachmentId: value.attachmentId,
        revision: value.revision,
        page,
        openerPageId: value.openerPageId as string | null,
        disposition: value.disposition,
      });
    }
    return Object.freeze({
      type: "changed",
      attachmentId: value.attachmentId,
      revision: value.revision,
      page,
    });
  }
}
