import { WorkspaceFileRevision } from "./workspace-file-revision";

/**
 * Dependency scope for an asynchronous workspace-file projection.
 *
 * While any projection is discovering resources, its safe dependency set is
 * the whole bundle. Once accepted, the scope narrows to the exact committed
 * paths. Rejected/stale preparations never replace the committed set.
 */
export class WorkspaceFileProjectionDependencies {
  private readonly inFlight = new Set<number>();
  private committed: readonly string[] | null = null;
  private nextSequence = 0;

  constructor(private readonly bundleRoot: string) {}

  begin(): WorkspaceFileProjectionDependencies.Request {
    const request = { sequence: ++this.nextSequence };
    this.inFlight.add(request.sequence);
    return request;
  }

  commit(
    request: WorkspaceFileProjectionDependencies.Request,
    paths: readonly string[]
  ): boolean {
    if (!this.inFlight.delete(request.sequence)) return false;
    this.committed = paths;
    return true;
  }

  discard(request: WorkspaceFileProjectionDependencies.Request): void {
    this.inFlight.delete(request.sequence);
  }

  scope(): WorkspaceFileRevision.Scope {
    return WorkspaceFileRevision.dependencies(
      this.bundleRoot,
      this.inFlight.size > 0 ? null : this.committed
    );
  }
}

export namespace WorkspaceFileProjectionDependencies {
  export type Request = {
    readonly sequence: number;
  };
}
