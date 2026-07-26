/**
 * Durable chat-view recovery after a stream/client-state failure.
 *
 * Recovery is deliberately headless: React only supplies the current messages
 * and effectful adapters. The ordering is the contract:
 *
 *  1. an ordinary user tail rejected by atomic admission
 *     (`human-input-pending` / `run_in_flight`) is moved into the durable queue,
 *  2. the authoritative transcript is rehydrated (dropping the optimistic
 *     local tail),
 *  3. a still-live stream is reattached,
 *  4. only a complete recovery authorizes clearing the visible error.
 */

import type { UIMessage } from "ai";
import type { chatError } from "./chat-error";

export namespace StreamRecovery {
  export type Kind = Extract<
    chatError.Kind,
    "disconnect" | "stream-state" | "human-input-pending" | "run-in-flight"
  >;

  export type PendingUserTail = {
    id: string;
    text: string;
  };

  export type RunArgs = {
    kind: Kind;
    messages: UIMessage[];
    /** Required for an admission conflict (`human-input-pending` or
     * `run-in-flight`). */
    enqueuePendingTail?: (tail: PendingUserTail) => Promise<boolean>;
    rehydrate: () => Promise<UIMessage[] | null>;
    applyMessages: (messages: UIMessage[]) => void;
    resumeStream: () => void | Promise<void>;
  };

  /**
   * Return the final optimistic user message only when it can ride the
   * text-only durable queue without dropping another payload kind.
   */
  export function pendingUserTail(
    messages: UIMessage[]
  ): PendingUserTail | null {
    const last = messages.at(-1);
    if (!last || last.role !== "user" || !last.id) return null;
    const parts = last.parts ?? [];
    if (parts.length === 0 || parts.some((part) => part.type !== "text")) {
      return null;
    }
    const text = parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n\n")
      .trim();
    return text ? { id: last.id, text } : null;
  }

  /**
   * Restore the client view from durable state. Returns `true` only when the
   * caller may clear the error.
   */
  export async function run(args: RunArgs): Promise<boolean> {
    let queued = true;
    let optimisticTailRemoved: UIMessage[] | null = null;
    if (isAdmissionConflict(args.kind)) {
      const tail = pendingUserTail(args.messages);
      const last = args.messages.at(-1);
      if (last?.role === "user") {
        optimisticTailRemoved = args.messages.slice(0, -1);
      }
      if (!tail || !args.enqueuePendingTail) {
        queued = false;
      } else {
        try {
          queued = await args.enqueuePendingTail(tail);
        } catch {
          queued = false;
        }
      }
    }

    const restored = await args.rehydrate();
    if (restored) {
      args.applyMessages(restored);
      await args.resumeStream();
      return queued;
    }

    // `/agent/run` rejects before persistence, so removing its final
    // optimistic user tail is a safe local fallback when DB hydration itself
    // transiently fails. It restores the pending interaction controls instead
    // of leaving the session poisoned; the uncleared error remains honest when
    // that tail could not be durably queued.
    if (isAdmissionConflict(args.kind) && optimisticTailRemoved) {
      args.applyMessages(optimisticTailRemoved);
      return queued;
    }
    return false;
  }

  function isAdmissionConflict(kind: Kind): boolean {
    return kind === "human-input-pending" || kind === "run-in-flight";
  }
}
