"use client";

import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import {
  AGENT_SKILL_IDS,
  AGENT_TIERS,
  BYOK_PROVIDER_IDS,
  ai,
  type AgentRunOptions,
  type AgentUIMessageChunk,
} from "@/lib/desktop/bridge";

export type DesktopAgentTransportOptions = Partial<
  Omit<AgentRunOptions, "messages">
> & {
  /**
   * Fires once per send with the agent sidecar-resolved chat session id.
   * Callers use this to adopt the row created by the first send of a
   * fresh chat. Optional — a caller that doesn't track sessions (e.g. a
   * transient one-off send) can omit it.
   */
  onSessionId?: (sessionId: string) => void;
  /**
   * Fires once inside `reconnectToStream` IFF the agent sidecar has an
   * in-flight run for our chat id — *before* the first replayed chunk
   * is enqueued. The chat panel uses this to drop the in-progress
   * assistant message from `useChat`'s reducer so the agent sidecar's full
   * replay (from registry seq 1) rebuilds it cleanly instead of
   * stacking duplicate parts on top of the hydrated state.
   *
   * Skipped when the agent sidecar returns null (no in-flight run) — the
   * panel keeps whatever it hydrated from the DB.
   */
  onResumeStart?: () => void;
};

export namespace desktopAgentTransport {
  export function create(
    defaults: DesktopAgentTransportOptions = {}
  ): ChatTransport<UIMessage> {
    // The in-flight stream registry is keyed by the SERVER session id. A fresh
    // chat's AI-SDK `chatId` is a client-generated value that NEVER matches it
    // (the `Chat` is created with `id: currentId ?? undefined` and deliberately
    // not rebuilt when the session adopts its server id). So `reconnectToStream`
    // — which the AI SDK calls with `chatId` — MUST instead use the server id we
    // learn on send: otherwise a core-initiated turn (a queue drain) resumes a
    // 404 and silently renders nothing.
    let liveSessionId: string | null = defaults.session_id ?? null;
    const trackSessionId = (id: string) => {
      if (id) liveSessionId = id;
      defaults.onSessionId?.(id);
    };
    return {
      async sendMessages(options) {
        const body = readBodyOptions(options.body);
        if (body.session_id) liveSessionId = body.session_id;
        return streamFromBridge({
          ...defaults,
          ...body,
          onSessionId: trackSessionId,
          messages: options.messages,
          abortSignal: options.abortSignal,
        });
      },

      async reconnectToStream(options) {
        // Live server id first; fall back to `chatId` only before the first
        // send (no in-flight run to reconnect to anyway).
        const sessionId = liveSessionId ?? options?.chatId;
        if (!sessionId) return null;
        return await reconnectFromBridge(sessionId, defaults.onResumeStart);
      },
    };
  }
}

function streamFromBridge(
  opts: Partial<Omit<AgentRunOptions, "messages">> & {
    messages: UIMessage[];
    abortSignal?: AbortSignal;
    onSessionId?: (sessionId: string) => void;
  }
): ReadableStream<UIMessageChunk> {
  let sessionId: string | null = opts.session_id ?? null;
  let settled = false;

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const close = () => {
        if (settled) return;
        settled = true;
        controller.close();
      };
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        controller.error(err);
      };
      const abort = () => {
        if (sessionId) void ai.abortAgentRun(sessionId);
        close();
      };

      if (opts.abortSignal?.aborted) {
        close();
        return;
      }
      opts.abortSignal?.addEventListener("abort", abort, { once: true });

      try {
        const handle = await ai.startAgentRun(
          {
            messages: opts.messages,
            tier: opts.tier,
            model_id: opts.model_id,
            provider_id: opts.provider_id,
            feature: opts.feature,
            workspace_id: opts.workspace_id,
            skills: opts.skills,
            session_id: opts.session_id,
          },
          (chunk: AgentUIMessageChunk) => {
            if (!settled) controller.enqueue(chunk);
          }
        );
        sessionId = handle.sessionId || sessionId;
        if (handle.sessionId && opts.onSessionId) {
          try {
            opts.onSessionId(handle.sessionId);
          } catch {
            // consumer-thrown errors aren't ours; never break the stream
          }
        }
        if (opts.abortSignal?.aborted) {
          abort();
          return;
        }
        void handle.done.then(close, fail).finally(() => {
          opts.abortSignal?.removeEventListener("abort", abort);
        });
      } catch (err) {
        opts.abortSignal?.removeEventListener("abort", abort);
        fail(err);
      }
    },

    cancel() {
      if (sessionId) void ai.abortAgentRun(sessionId);
      settled = true;
    },
  });
}

/**
 * Resume an in-flight agent sidecar run. Buffers chunks that arrive between
 * `reconnect` resolving and `start()` firing (a small but real race),
 * fires `onResumeStart` *before* the first chunk reaches the reader
 * so the chat panel can drop the in-progress assistant — the AI SDK
 * reducer rejects `text-delta` chunks for a part it hasn't seen
 * `text-start` for, and the agent sidecar's replay re-emits the original
 * `text-start`. Returns `null` if the agent sidecar has no live run
 * (`useChat` treats null as a clean no-op).
 */
async function reconnectFromBridge(
  chatId: string,
  onResumeStart?: () => void
): Promise<ReadableStream<UIMessageChunk> | null> {
  const queue: AgentUIMessageChunk[] = [];
  let downstream: ReadableStreamDefaultController<UIMessageChunk> | null = null;

  const handle = await ai.reconnectAgentRun(chatId, 0, (chunk) =>
    downstream ? downstream.enqueue(chunk) : queue.push(chunk)
  );
  if (!handle) return null;

  try {
    onResumeStart?.();
  } catch {
    /* never let the reset hook break the stream */
  }

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      downstream = controller;
      for (const c of queue) controller.enqueue(c);
      queue.length = 0;
      void handle.done.then(
        () => controller.close(),
        (err) => controller.error(err)
      );
    },
  });
}

function readBodyOptions(body: unknown): DesktopAgentTransportOptions {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const obj = body as Record<string, unknown>;
  const out: DesktopAgentTransportOptions = {};
  if (
    typeof obj.tier === "string" &&
    (AGENT_TIERS as readonly string[]).includes(obj.tier)
  ) {
    out.tier = obj.tier as AgentRunOptions["tier"];
  }
  if (typeof obj.model_id === "string") {
    out.model_id = obj.model_id as AgentRunOptions["model_id"];
  }
  if (typeof obj.provider_id === "string") {
    if ((BYOK_PROVIDER_IDS as readonly string[]).includes(obj.provider_id)) {
      out.provider_id = obj.provider_id as AgentRunOptions["provider_id"];
    }
  }
  if (typeof obj.feature === "string") out.feature = obj.feature;
  if (typeof obj.workspace_id === "string") out.workspace_id = obj.workspace_id;
  if (typeof obj.session_id === "string") out.session_id = obj.session_id;
  if (Array.isArray(obj.skills)) {
    out.skills = obj.skills.filter(
      (item): item is NonNullable<AgentRunOptions["skills"]>[number] =>
        typeof item === "string" &&
        (AGENT_SKILL_IDS as readonly string[]).includes(item)
    );
  }
  return out;
}
