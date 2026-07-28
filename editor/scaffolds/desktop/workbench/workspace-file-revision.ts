import type { WorkspaceChangeEvent } from "@/lib/desktop/bridge";

/**
 * Revision policy for renders derived from workspace files.
 *
 * A render may depend on one exact file, a bundle subtree, or an explicit set
 * of resource paths. Workspace watcher batches advance its revision once when
 * any dependency changes. Path-addressed media can then include that revision
 * in its request URL; projections that inline bytes can use it as a reload key.
 */
export namespace WorkspaceFileRevision {
  export type Scope =
    | { kind: "exact"; relPath: string }
    | { kind: "subtree"; relPath: string }
    | { kind: "paths"; relPaths: readonly string[] };

  export function exact(relPath: string): Scope {
    return { kind: "exact", relPath };
  }

  export function subtree(relPath: string): Scope {
    return { kind: "subtree", relPath: trimTrailingSlash(relPath) };
  }

  export function paths(relPaths: readonly string[]): Scope {
    return { kind: "paths", relPaths };
  }

  /**
   * Projection dependencies are bundle-wide while discovery is in flight,
   * then narrow to the exact paths the completed projection declared. `[]`
   * means discovered-with-no-dependencies; `null` means not discovered yet.
   */
  export function dependencies(
    bundleRoot: string,
    relPaths: readonly string[] | null
  ): Scope {
    return relPaths === null ? subtree(bundleRoot) : paths(relPaths);
  }

  export function next(
    current: number,
    scope: Scope,
    events: readonly WorkspaceChangeEvent[]
  ): number {
    return changed(scope, events) ? current + 1 : current;
  }

  export function changed(
    scope: Scope,
    events: readonly WorkspaceChangeEvent[]
  ): boolean {
    return events.some((event) => matches(scope, event.rel_path));
  }

  export function url(source: string, revision: number): string {
    const url = new URL(source);
    url.searchParams.set("revision", String(revision));
    return url.toString();
  }

  function matches(scope: Scope, relPath: string): boolean {
    switch (scope.kind) {
      case "exact":
        return relPath === scope.relPath;
      case "subtree":
        return (
          scope.relPath === "" ||
          relPath === scope.relPath ||
          relPath.startsWith(`${scope.relPath}/`)
        );
      case "paths":
        return scope.relPaths.includes(relPath);
    }
  }

  function trimTrailingSlash(relPath: string): string {
    return relPath.replace(/\/+$/, "");
  }
}
