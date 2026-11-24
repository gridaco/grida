import equal from "deep-equal";
import type { ComposerMessage } from "@/kits/composer";

type SubmissionScope = object | string | number | undefined;

export type AgentComposerQueueSubmitLease = {
  readonly lifecycle: number;
  readonly sequence: number;
  readonly scope: SubmissionScope;
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
  private readonly listeners = new Set<() => void>();

  readonly read = () => this.active;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(): void {
    this.listeners.forEach((listener) => listener());
  }

  readonly mount = () => {
    if (!this.mounted) {
      this.lifecycle += 1;
      this.mounted = true;
    }
    return () => this.unmount();
  };

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    if (this.active) {
      this.active = null;
      this.publish();
    }
  }

  get inFlight(): boolean {
    return this.active !== null;
  }

  inFlightFor(scope: SubmissionScope): boolean {
    return this.active !== null && Object.is(this.active.scope, scope);
  }

  begin(scope?: SubmissionScope): AgentComposerQueueSubmitLease | null {
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
    this.publish();
    return lease;
  }

  owns(
    lease: AgentComposerQueueSubmitLease,
    scope: SubmissionScope = lease.scope
  ): boolean {
    return (
      this.mounted &&
      lease.lifecycle === this.lifecycle &&
      Object.is(lease.scope, scope) &&
      this.active === lease
    );
  }

  /** Release the current lease if it still owns the submission. */
  finish(lease: AgentComposerQueueSubmitLease): boolean {
    if (!this.owns(lease)) return false;
    this.active = null;
    this.publish();
    return true;
  }
}

/**
 * Whether a confirmed enqueue still describes the live clearable draft.
 *
 * Editor contexts are host-owned and `composer.clear()` intentionally retains
 * them, so context churn must not prevent clearing. Everything the clear does
 * remove—document-derived parts, text, formatting, and attachments—is compared.
 */
export function isSameComposerDraft(
  submitted: ComposerMessage,
  current: ComposerMessage
): boolean {
  return (
    submitted.meta.text === current.meta.text &&
    submitted.meta.markdown === current.meta.markdown &&
    equal(clearableParts(submitted), clearableParts(current), { strict: true })
  );
}

function clearableParts(message: ComposerMessage) {
  return message.parts.filter((part) => part.type !== "editor-context");
}
