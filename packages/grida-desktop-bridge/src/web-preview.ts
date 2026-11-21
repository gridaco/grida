import { DesktopBrowser } from "./browser";

export namespace WebPreview {
  export const MAX_TITLE_BYTES = 256;
  export const MAX_DESCRIPTION_BYTES = 512;
  export const MAX_PRODUCT_LABEL = 80;

  export type Metadata = Readonly<{
    title?: string;
    description?: string;
    productLabel?: string;
    favicon?: DesktopBrowser.Favicon;
  }>;

  export type Cancel = Readonly<{ attachmentId: string; id: string }>;
  export type Request = Cancel & Readonly<{ url: string }>;

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

  export function parseMetadata(raw: unknown): Metadata | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const { title, description, productLabel, favicon } = raw as Record<
      string,
      unknown
    >;
    const label = text(productLabel, MAX_PRODUCT_LABEL);
    const name = text(title, MAX_TITLE_BYTES);
    const detail = text(description, MAX_DESCRIPTION_BYTES);
    const icon = DesktopBrowser.parseFavicon(favicon);
    if (!name && !detail && !label && !icon) return null;
    return {
      title: name,
      description: detail,
      productLabel: label,
      favicon: icon ?? undefined,
    };
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
