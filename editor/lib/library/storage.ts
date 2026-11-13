/**
 * Public Library byte locations. The catalog stays in Supabase.
 * GRIDA-SEC-004: Validated first-party origin for Desktop's image-only carve-out.
 */
export namespace LibraryStorage {
  export type Asset = {
    path: string;
    sha256?: string | null;
    mimetype: string;
  };

  // Pinned across producers: MIME libraries disagree on jpg versus jpeg.
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };

  export function extension(mimetype: string): string | null {
    return extensions[mimetype] ?? null;
  }

  export function key(sha256: string, mimetype: string): string {
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error("Library object requires a lowercase SHA-256 digest");
    }
    const ext = extension(mimetype);
    if (!ext) throw new Error(`Unsupported Library media type: ${mimetype}`);
    return `${sha256}.${ext}`;
  }

  /** Explicit cutover; an unset provider preserves existing deployments. */
  export function provider(): "supabase" | "tigris" {
    const value = process.env.NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER;
    if (!value || value === "supabase") return "supabase";
    if (value === "tigris") return "tigris";
    throw new Error("Invalid Library storage provider");
  }

  export function baseUrl(): string {
    if (provider() === "supabase") {
      const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!origin) throw new Error("Missing Supabase URL for Library storage");
      return `${origin.replace(/\/$/, "")}/storage/v1/object/public/library`;
    }
    const configured =
      process.env.NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN ??
      "https://library.grida.co";
    const url = new URL(configured);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new Error("Invalid Library asset origin");
    }
    return url.href.replace(/\/$/, "");
  }

  export function origin(): string {
    return new URL(baseUrl()).origin;
  }

  export function url(asset: Asset): string {
    const path =
      provider() === "tigris"
        ? key(asset.sha256 ?? "", asset.mimetype)
        : asset.path.split("/").map(encodeURIComponent).join("/");
    return `${baseUrl()}/${path}`;
  }

  export function download(asset: Asset): string {
    return provider() === "tigris" ? url(asset) : `${url(asset)}?download=`;
  }
}
