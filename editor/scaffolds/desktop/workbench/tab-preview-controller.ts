/**
 * One tab rail's delayed preview state.
 *
 * The controller owns the interaction timing that would otherwise be spread
 * across one hover primitive per tab. React is only an external-store wire:
 * triggers forward pointer events here and one shared viewport renders the
 * current snapshot.
 *
 * A "pointer pass" starts cold and becomes warm once one preview opens. While
 * warm, sibling tabs switch immediately. Only leaving the whole rail resets the
 * pass; the short close bridge lets the pointer cross gaps between tabs without
 * flashing the shared viewport closed.
 */

export const TAB_PREVIEW_OPEN_DELAY_MS = 500;
export const TAB_PREVIEW_CLOSE_DELAY_MS = 100;

export type TabPreviewTarget = {
  readonly relPath: string;
  readonly anchor: HTMLElement;
};

export type TabPreviewSnapshot =
  | {
      readonly open: false;
      readonly relPath: null;
      readonly anchor: null;
    }
  | {
      readonly open: true;
      readonly relPath: string;
      readonly anchor: HTMLElement;
    };

const CLOSED: TabPreviewSnapshot = {
  open: false,
  relPath: null,
  anchor: null,
};

export class TabPreviewController {
  private snapshot: TabPreviewSnapshot = CLOSED;
  private pending: TabPreviewTarget | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private resetWarmOnClose = false;
  private warm = false;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): TabPreviewSnapshot => this.snapshot;

  matchesChangedPath(relPath: string): boolean {
    return (
      this.snapshot.open &&
      (relPath === this.snapshot.relPath ||
        relPath.startsWith(`${this.snapshot.relPath}/`))
    );
  }

  /** A real, non-touch tab trigger received the pointer. */
  pointerEnter(target: TabPreviewTarget, pointerType: string): void {
    if (this.disposed || pointerType === "touch") return;

    this.clearCloseTimer();

    if (this.warm) {
      this.cancelPending();
      this.commitOpen(target);
      return;
    }

    if (sameTarget(this.pending, target)) return;
    this.cancelPending();
    this.pending = target;
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      if (this.disposed || this.pending !== target) return;
      this.pending = null;
      this.warm = true;
      this.commitOpen(target);
    }, TAB_PREVIEW_OPEN_DELAY_MS);
  }

  /** A tab trigger lost the pointer; the rail itself may still be active. */
  pointerLeave(relPath: string, pointerType: string): void {
    if (this.disposed || pointerType === "touch") return;

    if (this.pending?.relPath === relPath) this.cancelPending();
    if (!this.snapshot.open || this.snapshot.relPath !== relPath) return;
    this.scheduleClose(relPath);
  }

  /**
   * The pointer left the whole rail. Keep the current pass warm during the
   * short close bridge so an accidental boundary crossing does not restart the
   * cold delay. If the bridge completes, the next pass starts cold.
   */
  railLeave(pointerType: string): void {
    if (this.disposed || pointerType === "touch") return;
    this.cancelPending();
    if (this.snapshot.open) {
      this.scheduleClose(this.snapshot.relPath, true);
    } else {
      this.warm = false;
    }
  }

  /** Close now and make the next pointer entry cold. */
  dismiss(): void {
    if (this.disposed) return;
    this.warm = false;
    this.cancelPending();
    this.clearCloseTimer();
    this.commitClosed();
  }

  /**
   * Reconcile against the rail's real tabs. A pending/visible target that was
   * closed must never outlive its trigger. Warmth survives removal while other
   * tabs remain, so closing the hovered tab can still hand off to its sibling.
   */
  reconcile(relPaths: Iterable<string>): void {
    if (this.disposed) return;
    const live = new Set(relPaths);
    if (this.pending && !live.has(this.pending.relPath)) this.cancelPending();
    if (this.snapshot.open && !live.has(this.snapshot.relPath)) {
      this.clearCloseTimer();
      this.commitClosed();
    }
    if (live.size === 0) this.warm = false;
  }

  /** Terminal cleanup for the owning tab rail. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPending();
    this.clearCloseTimer();
    this.warm = false;
    this.snapshot = CLOSED;
    this.listeners.clear();
  }

  private scheduleClose(relPath: string, resetWarmOnClose = false): void {
    this.resetWarmOnClose ||= resetWarmOnClose;
    if (this.closeTimer !== null) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      const resetWarm = this.resetWarmOnClose;
      this.resetWarmOnClose = false;
      if (
        !this.disposed &&
        this.snapshot.open &&
        this.snapshot.relPath === relPath
      ) {
        this.commitClosed();
      }
      if (resetWarm) this.warm = false;
    }, TAB_PREVIEW_CLOSE_DELAY_MS);
  }

  private cancelPending(): void {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    this.pending = null;
  }

  private clearCloseTimer(): void {
    if (this.closeTimer === null) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
    this.resetWarmOnClose = false;
  }

  private commitOpen(target: TabPreviewTarget): void {
    if (
      this.snapshot.open &&
      this.snapshot.relPath === target.relPath &&
      this.snapshot.anchor === target.anchor
    ) {
      return;
    }
    this.snapshot = {
      open: true,
      relPath: target.relPath,
      anchor: target.anchor,
    };
    this.notify();
  }

  private commitClosed(): void {
    if (!this.snapshot.open) return;
    this.snapshot = CLOSED;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function sameTarget(a: TabPreviewTarget | null, b: TabPreviewTarget): boolean {
  return a?.relPath === b.relPath && a.anchor === b.anchor;
}
