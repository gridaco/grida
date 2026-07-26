import equal from "deep-equal";
import type { ComposerMessage } from "@/kits/composer";

export type AgentComposerQueueSubmitLease = {
  readonly lifecycle: number;
  readonly sequence: number;
  readonly scope: string | number | undefined;
};

/**
 * Synchronous ownership for one queue enqueue acknowledgement.
 *
 * React state is deliberately not the lock: two Enter events can run before
 * the disabled-button render commits. Lifecycle-tagged leases also make a late
 * acknowledgement from a prior mount inert, including across StrictMode's
 * setup/cleanup replay.
 */
export class AgentComposerQueueSubmitGuard {
  private lifecycle = 0;
  private sequence = 0;
  private mounted = false;
  private active: AgentComposerQueueSubmitLease | null = null;

  mount(): void {
    if (this.mounted) return;
    this.lifecycle += 1;
    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.active = null;
  }

  get inFlight(): boolean {
    return this.active !== null;
  }

  inFlightFor(scope: string | number | undefined): boolean {
    return this.active !== null && Object.is(this.active.scope, scope);
  }

  begin(scope?: string | number): AgentComposerQueueSubmitLease | null {
    if (!this.mounted) return null;
    if (this.active && Object.is(this.active.scope, scope)) return null;
    const lease = {
      lifecycle: this.lifecycle,
      sequence: ++this.sequence,
      scope,
    };
    // A real session rebind supersedes an acknowledgement for the prior
    // session. Its promise may still settle, but identity checks make it inert.
    this.active = lease;
    return lease;
  }

  owns(
    lease: AgentComposerQueueSubmitLease,
    scope: string | number | undefined = lease.scope
  ): boolean {
    return (
      this.mounted &&
      lease.lifecycle === this.lifecycle &&
      Object.is(lease.scope, scope) &&
      this.active === lease
    );
  }

  /**
   * Release the current lease. `true` means the owner is still mounted, so its
   * caller may safely commit React state for this settlement.
   */
  finish(lease: AgentComposerQueueSubmitLease): boolean {
    if (!this.owns(lease)) return false;
    this.active = null;
    return true;
  }
}

/**
 * Whether a confirmed enqueue still describes the live clearable draft.
 *
 * Editor contexts are host-owned and `composer.clear()` intentionally retains
 * them, so context churn must not prevent clearing. Everything the clear does
 * remove—document-derived parts, raw text, and attachments—is compared.
 */
export function isSameComposerDraft(
  submitted: ComposerMessage,
  current: ComposerMessage
): boolean {
  return (
    submitted.meta.text === current.meta.text &&
    equal(clearableParts(submitted), clearableParts(current), { strict: true })
  );
}

function clearableParts(message: ComposerMessage) {
  return message.parts.filter((part) => part.type !== "editor-context");
}
