/**
 * `useStreamAttach` — the thin React wire binding a chat surface to its
 * {@link StreamAttachOwner} (which holds ALL the logic; this file must stay
 * a dumb edge per the repo's core-first doctrine).
 *
 * Replaces `useResumeInFlight`. The differences are exactly the two H1
 * hazards the owner closes:
 *
 *   - the resume-once claim is keyed on `(session_id, epoch)` inside the
 *     owner — NOT on the `Chat` instance — so a mid-send rehydrate (which
 *     rebuilds the Chat) can no longer mint an unclaimed instance whose
 *     mount-resume opens a second stream over the live send;
 *   - the old racy `isStreaming`-through-a-ref snapshot is gone — the owner
 *     already knows whether an attach is live (its own grants + the
 *     transport's open/settle reports) and degrades the resume to
 *     claim-only when it is.
 *
 * `epoch` comes from `useChatSession().epoch`: it bumps on REAL rebindings
 * (select / start-new / restore / archive-of-current) and stays put on
 * same-session churn (hydration, mid-stream id adoption), so re-selecting a
 * busy session re-attaches while a rehydrate never does.
 */

"use client";

import { useEffect } from "react";
import type { StreamAttachOwner } from "./stream-attach-owner";

export type UseStreamAttachArgs = {
  owner: StreamAttachOwner;
  /** Active server session id, or `null` before it is known/restored. */
  sessionId: string | null;
  /** The session binding generation from `useChatSession().epoch`. */
  epoch: number;
  /** `useChat`'s `resumeStream` — reconnects to the in-flight run (no-op on 404). */
  resumeStream: () => void | Promise<void>;
};

export function useStreamAttach(args: UseStreamAttachArgs): void {
  const { owner, sessionId, epoch, resumeStream } = args;
  useEffect(() => {
    owner.bind(sessionId ? { session_id: sessionId, epoch } : null);
    if (sessionId) owner.request("resume-mount", () => resumeStream());
  }, [owner, sessionId, epoch, resumeStream]);
}
