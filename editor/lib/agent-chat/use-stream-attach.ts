/**
 * `useStreamAttach` — the ONE React wire binding a chat surface to its
 * {@link StreamAttachOwner}. All decisions live in the owner (headless,
 * Node-tested); this hook only wires React's lifecycle to it — and it is
 * deliberately the SINGLE copy of that wiring, shared by the workspace
 * agent pane and the file-window sidebar (duplicating chat wiring across
 * exactly those two surfaces caused an earlier regression — see
 * `use-session-status.ts`).
 *
 * It owns three things on behalf of the surface:
 *
 *   1. **Binding + mount-resume.** Rebinds the owner on every
 *      `(session_id, epoch)` change and requests `resume-mount`. The
 *      resume-once claim is keyed on the binding inside the owner — NOT on
 *      the `Chat` instance — so a mid-send rehydrate (which used to mint an
 *      unclaimed instance whose mount-resume opened a second stream over
 *      the live send) can no longer re-fire it. `epoch` bumps only on REAL
 *      rebindings (`useChatSession().epoch`).
 *
 *   2. **Rehydrate-then-attach.** The resume executor seeds the chat from
 *      the DB snapshot first, then reconnects — deterministic ordering that
 *      doesn't depend on the reconcile effect (blocked while busy), so a
 *      restore into a BUSY session still shows its history before the
 *      replay lands on top.
 *
 *   3. **Self-heal.** A recoverable stream failure (`chat-error.ts`:
 *      `disconnect` / `stream-state` — the server state is durable; only
 *      this client's view died) triggers the owner's one-shot
 *      `requestRecovery`: restore from the DB, re-attach if the run is
 *      still live, and clear the error silently on success. A second
 *      failure in the same binding surfaces honestly.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import type { StreamAttachOwner } from "./stream-attach-owner";
import { chatError } from "./chat-error";

export type UseStreamAttachArgs = {
  owner: StreamAttachOwner;
  /** Active server session id, or `null` before it is known/restored. */
  sessionId: string | null;
  /** The session binding generation from `useChatSession().epoch`. */
  epoch: number;
  /** Awaitable DB re-fetch returning the applied messages —
   * `useChatSession().rehydrate_async` (identity-stable). */
  rehydrateAsync: () => Promise<UIMessage[] | null>;
  /** `useChat`'s setters/actions — read through refs internally, so the
   * caller passes them straight from the hook result. */
  setMessages: (messages: UIMessage[]) => void;
  /** `useChat`'s `resumeStream` — reconnects to the in-flight run (no-op on 404). */
  resumeStream: () => void | Promise<void>;
  /** `useChat`'s current error / clearError, for the self-heal. */
  error: Error | undefined;
  clearError: () => void;
};

export type UseStreamAttachResult = {
  /** A self-heal restore is in flight (drives the "Reconnecting…" hint). */
  recovering: boolean;
};

export function useStreamAttach(
  args: UseStreamAttachArgs
): UseStreamAttachResult {
  const {
    owner,
    sessionId,
    epoch,
    rehydrateAsync,
    setMessages,
    resumeStream,
    error,
    clearError,
  } = args;

  // useChat's actions get a fresh identity per render; the executors read
  // them through refs so the callbacks/effects below stay identity-stable.
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;
  const resumeStreamRef = useRef(resumeStream);
  resumeStreamRef.current = resumeStream;
  const clearErrorRef = useRef(clearError);
  clearErrorRef.current = clearError;

  const rehydrateThenAttach = useCallback(async () => {
    const msgs = await rehydrateAsync();
    if (msgs) setMessagesRef.current(msgs);
    await resumeStreamRef.current();
  }, [rehydrateAsync]);

  useEffect(() => {
    owner.bind(sessionId ? { session_id: sessionId, epoch } : null);
    if (sessionId) owner.request("resume-mount", rehydrateThenAttach);
  }, [owner, sessionId, epoch, rehydrateThenAttach]);

  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (!error) return;
    const kind = chatError.classify(error);
    if (!chatError.recoverable(kind)) return;
    const started = owner.requestRecovery(kind, async () => {
      try {
        await rehydrateThenAttach();
        clearErrorRef.current();
      } finally {
        setRecovering(false);
      }
    });
    if (started) setRecovering(true);
  }, [error, owner, rehydrateThenAttach]);

  return { recovering };
}
