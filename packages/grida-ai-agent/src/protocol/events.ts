/**
 * Lifecycle events protocol — the session-lifecycle facts the core
 * announces to consumers that are NOT the chat renderer (host
 * notifications, badges, loggers, automations). Client-safe.
 *
 * Spec: `docs/wg/ai/agent/events.md`. The channel is volatile (no
 * replay, no durability), observe-only (nothing on it can affect a
 * turn), multi-subscriber, and ordered per session (`turn-started`
 * precedes its `turn-finished`; `approval-requested` precedes the
 * `turn-finished` of the turn that blocked). Projected to hosts as a
 * host-wide SSE (`GET /events`).
 */

/**
 * How a turn ended. Mirrors the run registry's end reason — `finish`
 * is a natural completion, `abort` a user cancel, `error` a hard
 * failure (which pauses the queue drain, RFC `queue`).
 */
export type AgentTurnEndReason = "finish" | "abort" | "error";

/** A turn began on a session. */
export type AgentTurnStartedEvent = {
  type: "turn-started";
  session_id: string;
  /**
   * The user message the core fired for this turn — the fired-message
   * identity the turn-lifecycle wire must carry (RFC `turn-authority`).
   * Absent only when the turn was not fired from a user message (an
   * approval-answer resume continues the prior turn's tool call).
   */
  message_id?: string;
  /** Epoch ms the turn started. */
  at: number;
};

/** A turn ended on a session. */
export type AgentTurnFinishedEvent = {
  type: "turn-finished";
  session_id: string;
  /** Fired message of the turn that ended (same sourcing as `turn-started`). */
  message_id?: string;
  reason: AgentTurnEndReason;
  /**
   * True iff the turn ended BLOCKED on an unanswered supervised
   * approval (RFC `permission modes`). A blocked turn ends with
   * `reason: "finish"` — the run settled cleanly — but it is not a
   * completed turn: the session is waiting on the user, not done.
   * Carried here so a stateless consumer can tell "done" apart from
   * "waiting on you" without correlating events.
   */
  pending_approval: boolean;
  /** Epoch ms the turn ended. */
  at: number;
};

/**
 * A turn ended blocked on an unanswered supervised approval — the
 * discrete signal for the moment the session starts waiting on the
 * user. Emitted once per turn that ends blocked, ordered before that
 * turn's `turn-finished`.
 *
 * Deliberately carries no approval payload (which tool, which
 * command): the authoritative pending-approval state lives in the
 * persisted session and is read from there. The event is a doorbell,
 * not the letter — a forged or replayed event can never ANSWER
 * anything.
 */
export type AgentApprovalRequestedEvent = {
  type: "approval-requested";
  session_id: string;
  /** Epoch ms the blocked state was reached. */
  at: number;
};

/** The lifecycle event union a consumer reads off the channel. */
export type AgentLifecycleEvent =
  | AgentTurnStartedEvent
  | AgentTurnFinishedEvent
  | AgentApprovalRequestedEvent;

/**
 * SSE event name for a lifecycle frame on the host-wide `GET /events`
 * stream. Each frame's `data:` is an {@link AgentLifecycleEvent} JSON
 * body. Mirrors `GRIDA_STATUS_SSE_EVENT` (the per-session status
 * back-channel's frame name).
 */
export const GRIDA_EVENTS_SSE_EVENT = "grida-event" as const;
