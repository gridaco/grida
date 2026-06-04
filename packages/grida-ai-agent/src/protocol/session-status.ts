/**
 * Session status protocol — the **back-channel** a client reads to know
 * whether a session is idle / busy / retrying / error, without subscribing to
 * the chunk stream. Client-safe.
 *
 * Spec: `docs/wg/ai/agent/session.md` §Session status. The status is
 * authoritative in the **core** (an in-memory map owned by the run-state
 * machine — `runtime/session-scheduler.ts`), **volatile** (a host restart
 * reads every session as `idle`), and projected to clients over a per-session
 * SSE (`GET /sessions/:id/status`). The UI reads it as a fact; it never
 * decides what runs.
 */

/** The run-state a session projects to clients (RFC `queue` machine states). */
export type SessionRunState = "idle" | "busy" | "retrying" | "error";

/**
 * The status payload a client reads / a status frame carries.
 *
 * - `idle` — no run in flight (the default; also every session after a host
 *   restart). A submit while idle starts a turn now.
 * - `busy` — a turn is running. A submit enqueues (RFC `queue`), it does not
 *   start a second turn.
 * - `retrying` — the model call failed transiently and the loop is backing
 *   off; `attempt` + `message` describe the delay.
 * - `error` — a hard failure. The queue drain is **paused** until the next
 *   fired turn; `error` is not terminal (a retry / edit-and-resend clears it).
 */
export type SessionStatus = {
  state: SessionRunState;
  /** Current retry attempt — present when `state === "retrying"`. */
  attempt?: number;
  /** Human-readable status — present when `state === "retrying" | "error"`. */
  message?: string;
  /**
   * Epoch ms the active turn started — present when
   * `state === "busy" | "retrying"`.
   */
  started_at?: number;
};

/**
 * SSE event name for a session-status frame on `GET /sessions/:id/status`.
 * Each frame's `data:` is a {@link SessionStatus} JSON body. Mirrors
 * `GRIDA_SESSION_SSE_EVENT` (the run stream's in-band session-id frame).
 */
export const GRIDA_STATUS_SSE_EVENT = "grida-status" as const;
