/**
 * GRIDA-SEC-016 — bounded native browser values and destination validation.
 * Values are presentation data, never authority.
 */
export namespace DesktopBrowser {
  export const VERSION = 1 as const;
  export const MAX_PAGES = 16;
  export const MAX_URL_BYTES = 8192;
  export const MAX_TITLE_BYTES = 1024;
  export const MAX_FAILURE_MESSAGE_BYTES = 2048;
  export const MAX_LAYOUT_EDGE = 16384;
  export const MAX_LAYOUT_POSITION = 1_000_000;
  export const MAX_THUMBNAIL_WIDTH = 320;
  export const MAX_THUMBNAIL_HEIGHT = 180;
  export const MAX_THUMBNAIL_BYTES = 64 * 1024;

  /** Workspace storage persists; ephemeral storage is unique to one page. */
  export type StorageScope = "workspace" | "ephemeral";
  export type Target = Readonly<{ attachmentId: string; pageId: string }>;
  export type Create = Readonly<{
    attachmentId: string;
    storageScope: StorageScope;
    /** Omission creates a blank page. An empty or invalid URL rejects. */
    url?: string;
  }>;
  export type Navigate = Target & Readonly<{ url: string }>;
  export type Rect = Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  export type Layout = Readonly<{
    /** Positive, monotonically increasing within this attachment and page. */
    sequence: number;
    /** CSS pixels relative to the owning window's content area. */
    rect: Rect;
    visible: boolean;
    /**
     * Uniform radius of the page viewport's four corners in CSS pixels, at
     * most 8192. Omission means zero. Native clamps to half its smaller edge.
     */
    borderRadius?: number;
  }>;
  export type LayoutRequest = Target & Layout;
  /** Bounded, untrusted pixels of a page's best-effort last rendered viewport. */
  export type Thumbnail = Readonly<{
    /** JPEG only; no URLs, paths, scripts or image-loading options. */
    dataUrl: string;
    width: number;
    height: number;
  }>;
  export type Failure = Readonly<{
    kind: "navigation" | "renderer-gone";
    /** Bounded public classification, never an exception or upstream body. */
    code: string;
    message: string;
  }>;
  export type Page = Readonly<{
    id: string;
    /** Owner revision at which this page last changed. */
    revision: number;
    /** Null identifies an intentionally blank page. */
    url: string | null;
    title: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    focused: boolean;
    storageScope: StorageScope;
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

  export interface Bridge {
    readonly version: typeof VERSION;
    /** Native admission resolves the workspace identity; no paths are accepted. */
    attach(workspaceId: string): Promise<Snapshot>;
    snapshot(attachmentId: string): Promise<Snapshot>;
    /** Revokes this attachment and hides pages; live pages remain with Main. */
    detach(attachmentId: string): Promise<void>;
    create(request: Create): Promise<Page>;
    navigate(request: Navigate): Promise<void>;
    back(request: Target): Promise<void>;
    forward(request: Target): Promise<void>;
    reload(request: Target): Promise<void>;
    stop(request: Target): Promise<void>;
    focus(request: Target): Promise<void>;
    /** Native Main determines zoom, clipping and final native bounds. */
    layout(request: LayoutRequest): Promise<void>;
    close(request: Target): Promise<void>;
    /** Opens only this page's current, native-validated HTTP(S) URL. */
    openExternal(request: Target): Promise<void>;
    /**
     * Optional on older hosts. Explicit thumbnail read without showing,
     * focusing or navigating the page; unavailable captures resolve as null.
     */
    thumbnail?(request: Target): Promise<Thumbnail | null>;
    /** Clears the attached workspace's browser storage after closing its pages. */
    clearSession(request: Readonly<{ attachmentId: string }>): Promise<void>;
    /**
     * Optional, exact Settings-document action. Native confirms the registered
     * workspace and rechecks admission before clearing. False is cancellation;
     * true means clearing completed. Stale admission and other failures reject.
     * This grants no browser attachment or page authority.
     */
    clearWorkspaceData?(
      request: Readonly<{ workspaceId: string }>
    ): Promise<boolean>;
    /** Subscribe before attaching/reading; revision gaps require a snapshot. */
    subscribe(handler: (event: Event) => void): () => void;
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

  export function isStorageScope(value: unknown): value is StorageScope {
    return value === "workspace" || value === "ephemeral";
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

  /** Rejects unbounded geometry and caller-supplied zoom or native options. */
  export function parseLayout(value: unknown): Layout | null {
    if (
      !record(value) ||
      !keys(
        value,
        Object.hasOwn(value, "borderRadius")
          ? ["sequence", "rect", "visible", "borderRadius"]
          : ["sequence", "rect", "visible"]
      ) ||
      !isRevision(value.sequence) ||
      value.sequence === 0 ||
      typeof value.visible !== "boolean"
    )
      return null;
    const rect = parseRect(value.rect);
    if (!rect) return null;
    const borderRadius = value.borderRadius;
    if (
      borderRadius !== undefined &&
      (typeof borderRadius !== "number" ||
        !Number.isFinite(borderRadius) ||
        borderRadius < 0 ||
        borderRadius > MAX_LAYOUT_EDGE / 2)
    )
      return null;
    return Object.freeze({
      sequence: value.sequence,
      visible: value.visible,
      rect,
      ...(borderRadius !== undefined ? { borderRadius } : {}),
    });
  }

  function parseRect(value: unknown): Rect | null {
    if (!record(value) || !keys(value, ["x", "y", "width", "height"]))
      return null;
    const { x, y, width, height } = value;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      ![x, y, width, height].every(Number.isFinite) ||
      Math.abs(x) > MAX_LAYOUT_POSITION ||
      Math.abs(y) > MAX_LAYOUT_POSITION ||
      width < 0 ||
      height < 0 ||
      width > MAX_LAYOUT_EDGE ||
      height > MAX_LAYOUT_EDGE
    )
      return null;
    return Object.freeze({ x, y, width, height });
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

  /** Header validation for the host's 8-bit baseline/progressive JPEG encoder. */
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
      (value.kind !== "navigation" && value.kind !== "renderer-gone") ||
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
        "revision",
        "url",
        "title",
        "loading",
        "canGoBack",
        "canGoForward",
        "focused",
        "storageScope",
        "failure",
      ]) ||
      !isIdentity(value.id) ||
      !isRevision(value.revision) ||
      value.revision === 0 ||
      (value.url !== null && normalizeUrl(value.url) === null) ||
      !text(value.title, MAX_TITLE_BYTES) ||
      typeof value.loading !== "boolean" ||
      typeof value.canGoBack !== "boolean" ||
      typeof value.canGoForward !== "boolean" ||
      typeof value.focused !== "boolean" ||
      !isStorageScope(value.storageScope)
    )
      return null;
    const failure = value.failure === null ? null : parseFailure(value.failure);
    if (value.failure !== null && failure === null) return null;
    return Object.freeze({
      id: value.id,
      revision: value.revision,
      url: value.url as string | null,
      title: value.title,
      loading: value.loading,
      canGoBack: value.canGoBack,
      canGoForward: value.canGoForward,
      focused: value.focused,
      storageScope: value.storageScope,
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
    if (
      value.type !== "changed" ||
      !keys(value, ["type", "attachmentId", "revision", "page"])
    )
      return null;
    const page = parsePage(value.page);
    if (page === null || page.revision !== value.revision) return null;
    return Object.freeze({
      type: "changed",
      attachmentId: value.attachmentId,
      revision: value.revision,
      page,
    });
  }
}
