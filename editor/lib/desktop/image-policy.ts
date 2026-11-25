import { LibraryStorage } from "@/lib/library/storage";

/** GRIDA-SEC-004 — Desktop's external image sources, shared with chat. */
export namespace DesktopImagePolicy {
  export const fxShowcase = "https://fx-cdn.grida.co/showcase/";

  const publicImageOrigins = [
    "https://images.unsplash.com",
    "https://upload.wikimedia.org",
  ];

  function configuredLibraryOrigins() {
    return LibraryStorage.provider() === "tigris"
      ? [LibraryStorage.origin(), process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""]
      : [process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""];
  }

  /** Normalize an HTTP(S) image reference without accepting URL credentials. */
  export function webUrl(value: string): URL | undefined {
    if (!/^(?:https?:)?\/\//i.test(value)) return;
    try {
      const url = new URL(value.startsWith("//") ? `https:${value}` : value);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password
      ) {
        return url;
      }
    } catch {
      // Workspace references and invalid URLs are not web images.
    }
  }

  /** Exact HTTP(S) sources, with an optional path prefix such as /showcase/. */
  export function sources(
    library: string | readonly string[] = configuredLibraryOrigins()
  ): string[] {
    const origins = (typeof library === "string" ? [library] : library).flatMap(
      (value) => {
        if (!/^https?:\/\//i.test(value)) return [];
        const origin = webUrl(value)?.origin;
        return origin && !/[;*\s]/.test(origin) ? [origin] : [];
      }
    );
    return [...new Set([fxShowcase, ...publicImageOrigins, ...origins])];
  }

  export function allows(
    url: URL,
    sources: readonly string[],
    documentOrigin?: string
  ): boolean {
    if (url.origin === documentOrigin) return true;
    return sources.some((source) => {
      const allowed = new URL(source);
      return (
        url.origin === allowed.origin &&
        url.pathname.startsWith(allowed.pathname)
      );
    });
  }
}
