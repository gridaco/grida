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
 *   - `send`            — a user send (`buildAgentSend` → `sendMessage`).
 *   - `approval-resume` — the Allow/Deny body-send that resumes a paused
 *                         supervised tool call.
 *   - `resume-mount`    — reconnect on mount / Chat rebuild / session
 *                         switch (replaces `decideResumeInFlight`).
 *   - `resume-drain`    — attach to a core-started queue-drain turn
 *                         (requested by `useCoreTurnSync`'s executor).
 *   - `resume-recovery` — the self-heal re-attach (error recovery).
 *
 * The SDK's body-less tool/approval auto-resubmit is never requested — the
 * transport REPORTS it (`noteTransportOpen`/`noteTransportSettle`) and the
 * owner adopts it as a live attach, so everything else serializes behind it.
 *
 * ## Invariants (pinned by stream-attach-owner.test.ts)
 *
 *   I1 — at most one unsettled attach per owner: while one is live, `send` /
 *        `approval-resume` / `resume-drain` are denied `attach-in-flight`
 *        and `resume-mount` degrades to a claim (never a second stream).
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
  | "send"
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
  readonly session_id: string;
  readonly epoch: number;
};

export type StreamAttachPhase = "unbound" | "idle" | "attaching" | "recovering";

type Logger = (line: string) => void;

export class StreamAttachOwner {
  private binding: StreamAttachBinding | null = null;
  /** `resume-mount` executed (or claimed) for the current binding. */
  private resume_claimed = false;
  /** Granted executors that have not settled yet. */
  private pending_exec = 0;
  /** Transport-reported live streams (opens minus settles, floored at 0). */
  private open_streams = 0;
  /** Self-heal used for the current binding (one attempt max — a recovery
   * that dies again must surface honestly, not ping-pong). */
  private recovery_attempted = false;
  /** A `resume-recovery` executor is live (drives the `recovering` phase). */
  private recovering = false;
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

  get phase(): StreamAttachPhase {
    if (this.recovering) return "recovering";
    if (this.busy) return "attaching";
    return this.binding ? "idle" : "unbound";
  }

  /**
   * Rebind to a session identity. A no-op for the same `(session_id, epoch)`
   * (StrictMode re-effects, unrelated re-renders). A REAL change resets the
   * resume claim — re-selecting a busy session re-attaches by design. Any
   * still-unsettled exec from the previous binding is a bounded zombie (it
   * consumes its stream and dies); logged, never cancelled (I3).
   */
  bind(binding: StreamAttachBinding | null): void {
    const prev = this.binding;
    if (
      prev?.session_id === binding?.session_id &&
      prev?.epoch === binding?.epoch
    ) {
      return;
    }
    this.binding = binding;
    this.resume_claimed = false;
    this.recovery_attempted = false;
    if (this.busy) {
      this.note("superseded", `pending=${this.pending_exec}`);
    }
    this.note("bind");
  }

  /**
   * Report a recoverable stream failure (`chat-error.ts`: `disconnect` /
   * `stream-state` — the server state is intact; only this client's view
   * died). Returns `"recover"` exactly once per binding when a self-heal
   * attempt is sound (bound, nothing live); the caller then runs the
   * restore through `request("resume-recovery", …)`. Everything else —
   * unbound, an attach still live, or the one attempt already spent —
   * returns `"ignore"` and the failure surfaces honestly instead of
   * ping-ponging.
   */
  noteStreamError(kind: "disconnect" | "stream-state"): "recover" | "ignore" {
    if (!this.binding || this.busy || this.recovery_attempted) {
      this.note("recovery-ignore", `kind=${kind}`);
      return "ignore";
    }
    this.recovery_attempted = true;
    this.note("recovery", `kind=${kind}`);
    return "recover";
  }

  /** Pure read of what `request(intent)` would do right now. */
  decide(intent: StreamAttachIntent): StreamAttachDecision {
    switch (intent) {
      case "send":
      case "approval-resume":
        // A fresh chat's first send legitimately has no session id yet (the
        // server mints one) — sends never require a binding.
        if (this.busy) return deny("attach-in-flight");
        return grant("exec");
      case "resume-mount":
        if (!this.binding) return deny("no-session");
        if (this.resume_claimed) return deny("already-claimed");
        // A live attach means THIS client already holds the turn (its own
        // send, or an adopted auto-resubmit). Take the claim so the binding
        // is never re-resumed later, but never open a second stream over it
        // — exactly the old `decideResumeInFlight` claim-only case, now
        // keyed on owner state instead of the racy `isStreaming` snapshot.
        if (this.busy) return grant("claim-only");
        return grant("exec");
      case "resume-drain":
        if (!this.binding) return deny("no-session");
        if (this.busy) return deny("attach-in-flight");
        return grant("exec");
      case "resume-recovery":
        // Recovery is requested by the self-heal flow only; without a
        // binding (or over a live attach) there is nothing sound to do.
        if (!this.binding) return deny("no-session");
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
    if (intent === "resume-recovery") this.recovering = true;
    this.note("grant", `intent=${intent}`);
    const settle = () => {
      this.pending_exec = Math.max(0, this.pending_exec - 1);
      if (intent === "resume-recovery") this.recovering = false;
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
   * so every other intent serializes behind it. */
  noteTransportOpen(): void {
    this.open_streams += 1;
    this.note("adopt");
  }

  /** Transport report: a stream settled (closed / failed / cancelled).
   * Floored at zero — a settle for a stream this owner never saw open
   * (pre-construction, double-fire) must not underflow into fake capacity. */
  noteTransportSettle(): void {
    this.open_streams = Math.max(0, this.open_streams - 1);
    this.note("stream-settle");
  }

  private note(event: string, detail?: string): void {
    try {
      this.log(
        `[agent-chat:attach] ${event}${detail ? ` ${detail}` : ""} ` +
          `session=${this.binding?.session_id ?? "-"} epoch=${
            this.binding?.epoch ?? "-"
          } pending=${this.pending_exec} open=${this.open_streams}`
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
