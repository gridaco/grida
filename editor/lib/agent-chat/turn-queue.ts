/**
 * Turn-queue orchestration — the **pure decision core** behind queued sends.
 *
 * This module is the host-side half of the [Turn Queue](../../../docs/wg/ai/agent/queue.md)
 * contract. The DRAIN — deciding which queued item fires next, and when — is
 * CORE state now (the `SessionScheduler`); the UI never drives it. What remains
 * here is the one client decision: a submit while the session is busy OR
 * waiting on human input **enqueues** rather than starting a new turn.
 * Manual end-to-end regression: `test/desktop-agent-chat-human-input-queue.md`.
 *
 * Keeping it pure makes that rule — plus what counts as "busy" — provable in a
 * plain unit test with no React, no bridge, and no live agent (see
 * `turn-queue.test.ts`). The effectful wiring lives in
 * `use-turn-queue-controller.ts`; reacting to the core drain lives in
 * `use-session-status.ts`.
 */

import type { SessionRunState, SessionStatus } from "@grida/agent";
import type { ChatStreamStatus } from "./use-refresh-on-stream-end";

/** The AI SDK `useChat` status this module reasons over. */
export type TurnQueueStatus = ChatStreamStatus;

/**
 * Is the session **busy** from the AI-SDK client's point of view?
 *
 * Busy = a turn is in flight (`submitted` / `streaming`) **or** a maintenance
 * operation is running (`maintenance` — e.g. an in-flight compaction). This is
 * the client-LOCAL view; the surface OR-folds it with the authoritative core
 * `SessionStatus` (so a core-started turn this client hasn't attached to yet
 * also counts as busy) before passing the result to the controller.
 *
 * Folding compaction into "busy" is the fix for the scenario where a user runs
 * `/compact` and types a message before it finishes: without it the message
 * raced straight into a new turn; with it the message queues and drains when
 * compaction settles. See
 * [`ux / queued sends`](../../../docs/wg/ai/agent/ux.md#queued-sends).
 */
export function isSessionBusy(
  status: TurnQueueStatus,
  maintenance: boolean
): boolean {
  return status === "submitted" || status === "streaming" || maintenance;
}

/**
 * Is the authoritative core state paused on a decision only a person can make?
 *
 * Kept separate from {@link isSessionBusy}: waiting has no active run to Stop,
 * but it still blocks admission of a NEW turn.
 */
export function isHumanInputPendingState(
  state: SessionRunState | null | undefined
): boolean {
  return state === "waiting_on_approval" || state === "waiting_on_user_input";
}

export type HumanInputWaitingState =
  | "waiting_on_approval"
  | "waiting_on_user_input";

/**
 * May a transcript-local pending control still represent authoritative state?
 *
 * Before the first status frame, the hydrated transcript is the fallback. Once
 * status is available, only a control matching the core's waiting kind remains
 * current; idle/busy/error (or the other waiting kind) suppresses stale local
 * parts immediately while reconciliation catches the transcript up.
 */
export function shouldUseLocalHumanInput(
  status: SessionStatus | null | undefined,
  waitingState: HumanInputWaitingState
): boolean {
  // Released Desktop sidecars have no explicit waiting states and project
  // `idle` while an approval/question is open. Their missing marker means the
  // hydrated transcript remains authoritative for presentation.
  if (status?.human_input_state_authoritative !== true) return true;
  return status.state === waitingState;
}

/**
 * What to do with a fresh submit: **enqueue** behind a busy or human-blocked
 * session, or **send** it now (RFC `queue`: never start a second concurrent
 * turn and never run ahead of a pending human decision).
 *
 * `busy` and `admissionBlocked` stay separate on purpose. A session waiting
 * for approval/a question — or temporarily missing its authoritative status
 * channel — has no known active run to stop, but an ordinary follow-up must
 * still enter the durable queue instead of racing a direct run.
 */
export function decideSubmit(args: {
  busy: boolean;
  admissionBlocked: boolean;
}): "enqueue" | "send" {
  return args.busy || args.admissionBlocked ? "enqueue" : "send";
}
