/**
 * Session status protocol — the **back-channel** a client reads to know
 * whether a session is idle / busy / waiting / retrying / error, without
 * subscribing to the chunk stream. Client-safe.
 *
 * Spec: `docs/wg/ai/agent/session.md` §Session status. The status is
 * authoritative in the **core** (the run-state machine plus persisted
 * human-input state — `runtime/session-scheduler.ts`) and projected to clients
 * over a per-session SSE (`GET /sessions/:id/status`). The UI reads it as a
 * fact; it never decides what runs.
 */

/** The run-state a session projects to clients (RFC `queue` machine states). */
export type SessionRunState =
  | "idle"
  | "busy"
  | "waiting_on_approval"
  | "waiting_on_user_input"
  | "retrying"
  | "error";

/**
 * The status payload a client reads / a status frame carries.
 *
 * - `idle` — no run is in flight and no persisted human interaction is open.
 *   A submit while idle starts a turn now.
 * - `busy` — a turn is running. A submit enqueues (RFC `queue`), it does not
 *   start a second turn.
 * - `waiting_on_approval` — the run paused on a supervised tool approval.
 *   The approval response resumes that same turn; an ordinary submit must not
 *   start another one.
 * - `waiting_on_user_input` — the run paused on a human-input tool such as
 *   `question`. The tool result resumes that same turn; an ordinary submit
 *   must not start another one.
 * - `retrying` — the model call failed transiently and the loop is backing
 *   off; `attempt` + `message` describe the delay.
 * - `error` — a hard failure. The queue drain is **paused** until the next
 *   fired turn; `error` is not terminal (a retry / edit-and-resend clears it).
 */
export type SessionStatus = {
  state: SessionRunState;
  /**
   * Present on status frames from a core that reconstructs persisted
   * approval/question waits. Omission means the legacy protocol, where `idle`
   * cannot disprove a transcript-local human-input control.
   */
  human_input_state_authoritative?: true;
  /**
   * Present when queue admission treats `(session, message id, text)` as a
   * durable idempotency key, including after fire/cancel.
   */
  queue_enqueue_idempotent?: true;
  /** Current retry attempt — present when `state === "retrying"`. */
  attempt?: number;
  /** Human-readable status — present when `state === "retrying" | "error"`. */
  message?: string;
  /**
   * Epoch ms the active turn started — present when
   * `state === "busy" | "retrying"`.
   */
  started_at?: number;
  /**
   * The user message fired by this active turn — present on `busy` when a
   * direct submit or queue drain starts a new user turn. Absent when the turn
   * resumes an approval/question because that continuation fires no new user
   * message.
   */
  message_id?: string;
};

/**
 * SSE event name for a session-status frame on `GET /sessions/:id/status`.
 * Each frame's `data:` is a {@link SessionStatus} JSON body. Mirrors
 * `GRIDA_SESSION_SSE_EVENT` (the run stream's in-band session-id frame).
 */
export const GRIDA_STATUS_SSE_EVENT = "grida-status" as const;
