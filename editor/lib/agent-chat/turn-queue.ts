/**
 * Turn-queue orchestration — the **pure decision core** behind queued sends.
 *
 * This module is the host-side half of the [Turn Queue](../../../docs/wg/ai/agent/queue.md)
 * contract. The DRAIN — deciding which queued item fires next, and when — is
 * CORE state now (the `SessionScheduler`); the UI never drives it. What remains
 * here is the one client decision: a submit while the session is busy
 * **enqueues** rather than starting a second concurrent turn.
 *
 * Keeping it pure makes that rule — plus what counts as "busy" — provable in a
 * plain unit test with no React, no bridge, and no live agent (see
 * `turn-queue.test.ts`). The effectful wiring lives in
 * `use-turn-queue-controller.ts`; reacting to the core drain lives in
 * `use-session-status.ts`.
 */

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
 * What to do with a fresh submit: **enqueue** behind a busy session, or
 * **send** it now (RFC `queue`: never start a second concurrent turn). `busy`
 * is the surface's combined signal (client-local busy OR core busy).
 */
export function decideSubmit(args: { busy: boolean }): "enqueue" | "send" {
  return args.busy ? "enqueue" : "send";
}
