import { DesktopBrowser } from "./browser";

export namespace WebPreview {
  export const MAX_TITLE_BYTES = 256;
  export const MAX_DESCRIPTION_BYTES = 512;
  export const MAX_PRODUCT_LABEL = 80;

  /** Display metadata shared by the loopback and public preview operations. */
  export type Metadata = Readonly<{
    title?: string;
    description?: string;
    favicon?: DesktopBrowser.Favicon;
    image?: LinkImage;
    /** A declared product label, for display only. */
    productLabel?: string;
  }>;
  export type LinkMetadata = Metadata;
  /** Bounded, sandbox-rasterized JPEG pixels for display. */
  export type LinkImage = Readonly<{ dataUrl: string }>;

  export type Kind = "loopback" | "public";
  export type Cancel = Readonly<{ attachmentId: string; id: string }>;
  export type Request = Cancel & Readonly<{ url: string }>;
  /** A completed lookup. Missing metadata is a completed miss. */
  export type Result = Readonly<{ metadata: Metadata | null }>;

  export function normalizeUrl(raw: unknown): string | null {
    const href = DesktopBrowser.normalizeUrl(raw);
    if (!href) return null;
    const { hostname, port } = new URL(href);
    const local =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]";
    return local && port ? href : null;
  }

  /** Public preview syntax. Main independently checks the actual address. */
  export function normalizePublicUrl(raw: unknown): string | null {
    const href = DesktopBrowser.normalizeUrl(raw);
    if (!href) return null;
    const url = new URL(href);
    const host = url.hostname.replace(/\.$/, "");
    if (
      url.port ||
      (!host.includes(".") && !host.startsWith("[")) ||
      /(?:^|\.)(?:localhost|local|internal|onion)$/.test(host) ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "[::1]"
    )
      return null;
    url.hash = "";
    return url.href;
  }

  export function parseMetadata(raw: unknown): Metadata | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const { title, description, favicon, image, productLabel } = raw as Record<
      string,
      unknown
    >;
    const name = text(title, MAX_TITLE_BYTES);
    const detail = text(description, MAX_DESCRIPTION_BYTES);
    const label = text(productLabel, MAX_PRODUCT_LABEL);
    const icon = DesktopBrowser.parseFavicon(favicon);
    const banner = DesktopBrowser.parseLinkImage(image);
    if (!name && !detail && !label && !icon && !banner) return null;
    return {
      ...(name && { title: name }),
      ...(detail && { description: detail }),
      ...(label && { productLabel: label }),
      ...(icon && { favicon: icon }),
      ...(banner && { image: banner }),
    };
  }

  export const parseLinkMetadata = parseMetadata;

  export function parseResult(raw: unknown): Result | null {
    if (
      !raw ||
      typeof raw !== "object" ||
      !Object.hasOwn(raw, "metadata") ||
      Object.keys(raw).length !== 1
    )
      return null;
    const { metadata } = raw as Record<string, unknown>;
    if (metadata === null) return { metadata };
    const parsed = parseMetadata(metadata);
    return parsed ? { metadata: parsed } : null;
  }

  const encoder = new TextEncoder();

  function text(raw: unknown, limit: number): string | undefined {
    return typeof raw === "string" &&
      raw.length <= limit &&
      raw.trim() &&
      !/[\p{Cc}\p{Cs}]/u.test(raw) &&
      encoder.encode(raw).byteLength <= limit
      ? raw
      : undefined;
  }
}
