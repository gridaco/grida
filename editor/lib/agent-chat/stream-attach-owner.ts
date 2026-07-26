/**
 * `StreamAttachOwner` — the single authority over starting or attaching a
 * stream on a chat surface's AI-SDK `Chat`.
 *
 * ## The invalid design this replaces
 *
 * Attach decisions used to be spread across three independent React effects
 * (mount/rebuild resume, core queue-drain, the sends themselves), each
 * coordinating through async React state (`isStreaming` commits later than
 * the events race). The AI SDK's `makeRequest` has NO same-instance
 * concurrency guard — a second attach interleaves two streams into one
 * reducer state, drops the in-flight assistant via the reconnect's
 * destructive reset, and dies with "No tool invocation found" surfaced as a
 * bogus "network error" (the 2026-07-10 approval-resume incident class).
 * Timing coordination is not an invariant; ownership is.
 *
 * ## What this owns
 *
 * Every attach INTENT is requested here and granted/denied synchronously:
 *
 *   - `approval-resume` — the Allow/Deny body-send that resumes a paused
 *                         supervised tool call.
 *   - `resume-mount`    — reconnect on mount / Chat rebuild / session
 *                         switch.
 *   - `resume-drain`    — attach to a core-started queue-drain turn
 *                         (requested by `useCoreTurnSync`'s executor).
 *   - `resume-recovery` — the self-heal re-attach ({@link requestRecovery}).
 *
 * Two stream sources are deliberately NOT requested intents:
 *
 *   - a plain user send — `decideSubmit` owns its gate with the correct
 *     busy semantics (busy → ENQUEUE, never drop; an owner deny would lose
 *     the message);
 *   - the SDK's body-less tool/approval auto-resubmit.
 *
 * Both are adopted instead: the transport REPORTS every opened stream
 * (`noteTransportOpen`/`noteTransportSettle`) and the owner treats it as
 * the live attach, so every requested intent serializes behind it.
 *
 * ## Invariants (pinned by stream-attach-owner.test.ts)
 *
 *   I1 — at most one unsettled attach per owner: while one is live,
 *        `approval-resume` / `resume-drain` / `resume-recovery` are denied
 *        `attach-in-flight` and `resume-mount` degrades to a claim (never a
 *        second stream).
 *   I2 — `resume-mount` executes at most once per `(session_id, epoch)`
 *        binding. The claim survives Chat-instance rebuilds (the H1 hazard:
 *        identity-keyed claims reset on every rehydrate) and StrictMode
 *        re-effects; it resets only on a REAL rebind.
 *   I3 — the owner never aborts anything. Detach≠abort stays the transport's
 *        contract; a denied intent is dropped (logged), not cancelled into.
 *   I4 — every grant / deny / adopt is logged with a stable prefix
 *        (`[agent-chat:attach]`) so a packaged-app incident is findable in
 *        the webview console.
 *   I5 — decisions and claims are synchronous; there is no await between
 *        deciding and marking, so concurrent effect runs cannot double-grant.
 *
 * Headless by doctrine: no React, no transport imports — provable in a plain
 * Node test. The React side is the thin `use-stream-attach.ts` wire.
 */

export type StreamAttachIntent =
  | "approval-resume"
  | "resume-mount"
  | "resume-drain"
  | "resume-recovery";

export type StreamAttachDenyReason =
  | "no-session"
  | "already-claimed"
  | "attach-in-flight";

export type StreamAttachDecision =
  | {
      readonly granted: true;
      /** `exec`: the intent's executor runs. `claim-only`: the resume claim
       * is taken WITHOUT opening a stream — this client already holds the
       * live attach (the mid-stream id-adoption case). */
      readonly mode: "exec" | "claim-only";
    }
  | { readonly granted: false; readonly reason: StreamAttachDenyReason };

/** The chat surface's current session identity. `epoch` distinguishes REAL
 * rebindings (select/start-new/restore/archive) from same-session churn
 * (hydration, mid-stream id adoption) — see `useChatSession().epoch`. */
export type StreamAttachBinding = {
  /** `null` while a fresh chat has not adopted its server session id yet. */
  readonly session_id: string | null;
  readonly epoch: number;
};

type Logger = (line: string) => void;
type StreamAttachLease = {
  readonly revision: number;
};
export type StreamAttachBindingLease = {
  readonly revision: number;
};
type RecoveryKind =
  | "disconnect"
  | "stream-state"
  | "human-input-pending"
  | "run-in-flight";
type RecoveryBudget = "stream-view" | "admission-conflict";

export class StreamAttachOwner {
  private binding: StreamAttachBinding | null = null;
  /**
   * Real-binding generation. Executor/transport settlements carry the
   * generation they opened under, so a zombie from session A cannot occupy or
   * release session B's attach slot after a session switch.
   */
  private binding_revision = 0;
  /** `resume-mount` executed (or claimed) for the current binding. */
  private resume_claimed = false;
  /** Granted executors that have not settled yet. */
  private pending_exec = 0;
  /** Transport-reported live streams (opens minus settles, floored at 0). */
  private open_streams = 0;
  /**
   * One self-heal per failure class and binding. Disconnect/reducer-desync
   * share a stream-view budget so they cannot ping-pong; the deterministic
   * admission-conflict repair has its own budget, so an earlier network flap
   * cannot leave a later rejected optimistic tail permanently poisoned.
   */
  private readonly recovery_attempted = new Set<RecoveryBudget>();
  private readonly log: Logger;

  constructor(opts?: { log?: Logger }) {
    this.log =
      opts?.log ??
      ((line) => {
        // eslint-disable-next-line no-console
        console.info(line);
      });
  }

  /** True while any granted executor or transport-reported stream is live. */
  private get busy(): boolean {
    return this.pending_exec > 0 || this.open_streams > 0;
  }

  /**
   * Rebind to a session identity. A no-op for the same `(session_id, epoch)`
   * (StrictMode re-effects, unrelated re-renders). A REAL change resets the
   * resume claim and current-binding occupancy — re-selecting a busy session
   * re-attaches by design. Any still-unsettled exec/stream from the previous
   * binding is a bounded zombie: its revision-tagged settlement cannot occupy
   * or release the new binding's slot, and it is never cancelled (I3).
   *
   * `null → server id` under the SAME epoch is the one non-real change: a fresh
   * chat adopted the session id minted by its already-live first send. Preserve
   * that send's ownership and only enrich the binding identity.
   */
  bind(binding: StreamAttachBinding): void {
    const prev = this.binding;
    if (
      prev?.session_id === binding?.session_id &&
      prev?.epoch === binding?.epoch
    ) {
      return;
    }
    const adoptedFreshSession =
      prev !== null &&
      prev.session_id === null &&
      binding.session_id !== null &&
      prev.epoch === binding.epoch;
    this.binding = binding;
    if (adoptedFreshSession) {
      this.note("adopt-session");
      return;
    }
    this.binding_revision += 1;
    this.resume_claimed = false;
    this.recovery_attempted.clear();
    if (this.busy) {
      this.note("superseded", `pending=${this.pending_exec}`);
    }
    this.pending_exec = 0;
    this.open_streams = 0;
    this.note("bind");
  }

  /**
   * Capture the current logical session binding for an async executor. A
   * null→server-id adoption keeps the revision; a real session/epoch rebind
   * invalidates it before any late continuation may touch renderer state.
   */
  captureBinding(): StreamAttachBindingLease {
    return { revision: this.binding_revision };
  }

  isCurrentBinding(lease: StreamAttachBindingLease): boolean {
    return lease.revision === this.binding_revision;
  }

  /**
   * The one-shot self-heal for a recoverable stream failure
   * (`chat-error.ts`: disconnect, stream-state, or a stale direct send that
   * lost atomic admission — the server state is intact; only this client's
   * view died). Gates, marks, and runs in one synchronous step: exactly once
   * per failure class and binding, only when a restore is sound (bound, nothing
   * live). Returns whether the recovery started — `false` means the failure
   * surfaces honestly instead of ping-ponging.
   */
  requestRecovery(
    kind: RecoveryKind,
    exec: () => void | Promise<void>
  ): boolean {
    const budget = recoveryBudget(kind);
    if (
      !this.binding?.session_id ||
      this.busy ||
      this.recovery_attempted.has(budget)
    ) {
      this.note("recovery-ignore", `kind=${kind}`);
      return false;
    }
    this.recovery_attempted.add(budget);
    this.note("recovery", `kind=${kind}`);
    // The gate above IS the resume-recovery decision (I5: no interleaving
    // between it and the request), so this grant cannot be denied.
    return this.request("resume-recovery", exec).granted;
  }

  /** Pure read of what `request(intent)` would do right now. */
  decide(intent: StreamAttachIntent): StreamAttachDecision {
    switch (intent) {
      case "approval-resume":
        // A fresh chat's approval can arrive before the session id is
        // adopted — approval sends never require a binding.
        if (this.busy) return deny("attach-in-flight");
        return grant("exec");
      case "resume-mount":
        if (!this.binding?.session_id) return deny("no-session");
        if (this.resume_claimed) return deny("already-claimed");
        // A live attach means THIS client already holds the turn (its own
        // send, or an adopted auto-resubmit). Take the claim so the binding
        // is never re-resumed later, but never open a second stream over it
        // — keyed on owner state instead of a racy `isStreaming` snapshot.
        if (this.busy) return grant("claim-only");
        return grant("exec");
      case "resume-drain":
      case "resume-recovery":
        if (!this.binding?.session_id) return deny("no-session");
        if (this.busy) return deny("attach-in-flight");
        return grant("exec");
    }
  }

  /**
   * Decide, mark, and (when granted `exec`) run the executor. The decision
   * and all state marks are synchronous (I5); the executor's settlement is
   * observed via its promise. Executor failures are logged and swallowed —
   * stream errors surface through the chat's own error channel, not here.
   */
  request(
    intent: StreamAttachIntent,
    exec: () => void | Promise<void>
  ): StreamAttachDecision {
    const decision = this.decide(intent);
    if (!decision.granted) {
      this.note("deny", `intent=${intent} reason=${decision.reason}`);
      return decision;
    }
    if (intent === "resume-mount") this.resume_claimed = true;
    if (decision.mode === "claim-only") {
      this.note("claim", `intent=${intent}`);
      return decision;
    }
    this.pending_exec += 1;
    const revision = this.binding_revision;
    this.note("grant", `intent=${intent}`);
    const settle = () => {
      if (revision !== this.binding_revision) {
        this.note("settle-stale", `intent=${intent}`);
        return;
      }
      this.pending_exec = Math.max(0, this.pending_exec - 1);
      this.note("settle", `intent=${intent}`);
    };
    const fail = (err: unknown) => {
      this.note(
        "exec-error",
        `intent=${intent} err=${err instanceof Error ? err.message : String(err)}`
      );
    };
    // Invoke synchronously — a granted send issues its request in the same
    // tick, so a later same-tick intent observes the live attach (I5).
    try {
      const result = exec();
      void Promise.resolve(result).catch(fail).finally(settle);
    } catch (err) {
      fail(err);
      settle();
    }
    return decision;
  }

  /** Transport report: a stream opened (incl. the SDK's body-less
   * auto-resubmit, which is never `request`ed). Adopts it as a live attach
   * so every other intent serializes behind it. The returned opaque lease MUST
   * ride the matching settle callback; it prevents an old binding's late
   * settle from releasing the current stream. */
  noteTransportOpen(): StreamAttachLease {
    const lease = { revision: this.binding_revision };
    this.open_streams += 1;
    this.note("adopt");
    return lease;
  }

  /** Transport report: a stream settled (closed / failed / cancelled).
   * A revision-tagged stale settlement is ignored. The optional argument keeps
   * defensive/test callers source-compatible; production reporters always
   * return the lease from {@link noteTransportOpen}. Floored at zero — a
   * settle for a stream this owner never saw open must not underflow. */
  noteTransportSettle(lease?: unknown): void {
    if (
      isStreamAttachLease(lease) &&
      lease.revision !== this.binding_revision
    ) {
      this.note("stream-settle-stale");
      return;
    }
    this.open_streams = Math.max(0, this.open_streams - 1);
    this.note("stream-settle");
  }

  private note(event: string, detail?: string): void {
    try {
      this.log(
        `[agent-chat:attach] ${event}${detail ? ` ${detail}` : ""} ` +
          `session=${this.binding?.session_id ?? "-"} epoch=${
            this.binding?.epoch ?? "-"
          } revision=${this.binding_revision} pending=${
            this.pending_exec
          } open=${this.open_streams}`
      );
    } catch {
      // logging must never break attach decisions
    }
  }
}

function grant(mode: "exec" | "claim-only"): StreamAttachDecision {
  return { granted: true, mode };
}

function deny(reason: StreamAttachDenyReason): StreamAttachDecision {
  return { granted: false, reason };
}

function recoveryBudget(kind: RecoveryKind): RecoveryBudget {
  return kind === "human-input-pending" || kind === "run-in-flight"
    ? "admission-conflict"
    : "stream-view";
}

function isStreamAttachLease(value: unknown): value is StreamAttachLease {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { revision?: unknown }).revision === "number"
  );
}
