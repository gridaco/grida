/**
 * Arbitrates asynchronous workspace-file reloads.
 *
 * A result is safe to apply only when it is the newest requested reload and no
 * editor content/write changed while its file reads were in flight.
 */
export class WorkspaceFileReloadGuard {
  private sequence = 0;

  begin(contentVersion: number): WorkspaceFileReloadGuard.Request {
    return { sequence: ++this.sequence, contentVersion };
  }

  accepts(
    request: WorkspaceFileReloadGuard.Request,
    current: { contentVersion: number; writeInFlight: boolean }
  ): boolean {
    return (
      request.sequence === this.sequence &&
      request.contentVersion === current.contentVersion &&
      !current.writeInFlight
    );
  }

  apply<T>(
    request: WorkspaceFileReloadGuard.Request,
    current: { contentVersion: number; writeInFlight: boolean },
    prepared: WorkspaceFileReloadGuard.Prepared<T>,
    load: (content: T) => void
  ): boolean {
    if (!this.accepts(request, current)) {
      prepared.discard?.();
      return false;
    }
    try {
      load(prepared.content);
      prepared.commit?.();
      return true;
    } catch (error) {
      prepared.discard?.();
      throw error;
    }
  }
}

export namespace WorkspaceFileReloadGuard {
  export type Request = {
    readonly sequence: number;
    readonly contentVersion: number;
  };

  /**
   * Side effects discovered while preparing a projection stay deferred until
   * the guarded content is the one actually loaded.
   */
  export type Prepared<T> = {
    readonly content: T;
    readonly commit?: () => void;
    readonly discard?: () => void;
  };
}
