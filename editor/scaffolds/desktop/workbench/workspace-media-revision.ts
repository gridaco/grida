import type { WorkspaceChangeEvent } from "@/lib/desktop/bridge";

/**
 * Content-revision policy for workspace media elements.
 *
 * A workspace image/video URL is path-addressed, so overwriting the file does
 * not change its base URL. The file watcher supplies the missing invalidation
 * signal; the renderer turns its local revision into a distinct request URL.
 */
export namespace WorkspaceMediaRevision {
  export function matches(
    events: readonly WorkspaceChangeEvent[],
    relPath: string
  ): boolean {
    return events.some((event) => event.rel_path === relPath);
  }

  export function url(source: string, revision: number): string {
    const url = new URL(source);
    url.searchParams.set("revision", String(revision));
    return url.toString();
  }
}
