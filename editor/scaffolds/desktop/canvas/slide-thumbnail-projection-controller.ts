import type { WorkspaceChangeEvent } from "@/lib/desktop/bridge";
import { WorkspaceFileRevision } from "../workbench/workspace-file-revision";

/**
 * Dependency and async-result policy for slide thumbnail projections.
 *
 * React owns only the bridge reads and rendered map. This controller decides
 * which slide paths need reads and which asynchronous completion is still
 * current enough to publish.
 */
export class SlideThumbnailProjectionController {
  private readonly entries = new Map<
    string,
    {
      relPath: string;
      dependencies: readonly string[];
      loading: boolean;
      sequence: number;
    }
  >();
  private nextSequence = 0;

  constructor(private basePath: string) {}

  reset(basePath: string): void {
    this.basePath = basePath;
    this.entries.clear();
  }

  reconcile(srcs: readonly string[]): {
    load: string[];
    removed: string[];
  } {
    const live = new Set(srcs);
    const removed: string[] = [];
    for (const src of this.entries.keys()) {
      if (!live.has(src)) {
        this.entries.delete(src);
        removed.push(src);
      }
    }

    const load: string[] = [];
    for (const src of live) {
      if (this.entries.has(src)) continue;
      const relPath = this.resolve(src);
      this.entries.set(src, {
        relPath,
        dependencies: [relPath],
        loading: false,
        sequence: 0,
      });
      load.push(src);
    }
    return { load, removed };
  }

  begin(src: string): SlideThumbnailProjectionController.Request | null {
    const entry = this.entries.get(src);
    if (!entry) return null;
    const sequence = ++this.nextSequence;
    entry.sequence = sequence;
    entry.loading = true;
    return { src, relPath: entry.relPath, sequence };
  }

  complete(
    request: SlideThumbnailProjectionController.Request,
    dependencies: readonly string[]
  ): boolean {
    const entry = this.current(request);
    if (!entry) return false;
    entry.loading = false;
    entry.dependencies = [
      entry.relPath,
      ...dependencies.filter((path) => path !== entry.relPath),
    ];
    return true;
  }

  fail(request: SlideThumbnailProjectionController.Request): boolean {
    const entry = this.current(request);
    if (!entry) return false;
    entry.loading = false;
    return true;
  }

  changed(events: readonly WorkspaceChangeEvent[]): string[] {
    const bundleChanged = WorkspaceFileRevision.changed(
      WorkspaceFileRevision.subtree(this.basePath),
      events
    );
    const changed: string[] = [];
    for (const [src, entry] of this.entries) {
      if (
        (entry.loading && bundleChanged) ||
        WorkspaceFileRevision.changed(
          WorkspaceFileRevision.paths(entry.dependencies),
          events
        )
      ) {
        changed.push(src);
      }
    }
    return changed;
  }

  private current(request: SlideThumbnailProjectionController.Request) {
    const entry = this.entries.get(request.src);
    return entry?.sequence === request.sequence ? entry : null;
  }

  private resolve(src: string): string {
    return this.basePath ? `${this.basePath}/${src}` : src;
  }
}

export namespace SlideThumbnailProjectionController {
  export type Request = {
    readonly src: string;
    readonly relPath: string;
    readonly sequence: number;
  };
}
