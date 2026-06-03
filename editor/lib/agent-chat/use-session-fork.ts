/**
 * Fork interaction + its UI feedback, owned in one place.
 *
 * Forking (RFC `session / fork`) copies the conversation into a new session
 * and switches to it. The copy looks identical to the source and the switch
 * is instant, so a fork reads as a no-op unless the surface confirms it.
 *
 * Every fork entry point — the per-message action button, the `/fork`
 * command, any future trigger — calls {@link UseSessionFork.fork}; on success
 * `justForked` pulses true for a few seconds so the surface can render a
 * brief notice ({@link ForkedNotice} in `@/kits/agent-chat`). One hook so the
 * action and its feedback can never drift apart across surfaces.
 */
import { useCallback, useEffect, useState } from "react";
import { sessions as bridgeSessions } from "@/lib/desktop/bridge";
import type { UseChatSessionResult } from "./use-chat-session";

/** How long the post-fork notice stays up before auto-dismissing. */
const FORK_NOTICE_MS = 3000;

export type UseSessionFork = {
  /** Fork the current session at `fromMessageId` and switch to the copy. */
  fork: (fromMessageId: string) => Promise<void>;
  /** True for {@link FORK_NOTICE_MS} right after a successful fork. */
  just_forked: boolean;
};

export function useSessionFork(
  session: UseChatSessionResult,
  /** Block forking while the session is busy — a streaming turn OR a
   *  maintenance op (compaction). A fork copies the visible transcript, so
   *  forking mid-compaction would copy a half-written summary. This is the
   *  session-busy concept, not "is a turn streaming" — see
   *  `isSessionBusy` in `turn-queue.ts`. */
  busy: boolean
): UseSessionFork {
  const [justForked, setJustForked] = useState(false);

  const fork = useCallback(
    async (fromMessageId: string) => {
      const sid = session.current_id;
      if (!sid || busy) return;
      try {
        const created = await bridgeSessions.fork(sid, fromMessageId);
        session.apply_resolved_session_id(created.id);
        setJustForked(true);
      } catch (err) {
        console.warn("[agent-chat] fork failed", err);
      }
    },
    [session, busy]
  );

  useEffect(() => {
    if (!justForked) return;
    const t = setTimeout(() => setJustForked(false), FORK_NOTICE_MS);
    return () => clearTimeout(t);
  }, [justForked]);

  return { fork, just_forked: justForked };
}
