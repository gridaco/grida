/**
 * GRIDA-SEC-004 — the agent tenant's HTTP transport.
 *
 * `@grida/daemon/transport` owns the seam primitives (Basic-Auth signing,
 * fetch plumbing, SSE frame decoding, typed errors) and the client methods
 * for the daemon-owned route groups (handshake, files, recents,
 * workspaces). This module extends that client with the agent tenant's
 * groups — sessions, agent run/stream, lifecycle events, secrets,
 * providers, images, video — and re-exposes the primitives under
 * `AgentTransport` so callers deal with ONE namespace. Consumers should
 * not hand-build route strings.
 */

import { DaemonTransport } from "@grida/daemon/transport";
import { GRIDA_SESSION_SSE_EVENT, type AgentRunOptions } from "./protocol/run";
import {
  GRIDA_STATUS_SSE_EVENT,
  type SessionStatus,
} from "./protocol/session-status";
import {
  GRIDA_EVENTS_SSE_EVENT,
  type AgentLifecycleEvent,
} from "./protocol/events";
import type {
  ImageGenerateRequest,
  ImageGenerateResult,
} from "./protocol/images";
import type {
  VideoGenerateRequest,
  VideoGenerateResult,
} from "./protocol/video";
import type { AgentUIMessageChunk } from "./protocol/wire";
import type {
  ChatMessageWithParts,
  ChatSessionRow,
  CreateSessionOptions,
  PatchSessionOptions,
  RewindResult,
  SessionListFilter,
  SessionListPage,
} from "./session/rows";
import type {
  EndpointProviderConfig,
  ProbedEndpointModel,
} from "./protocol/endpoints";

export namespace AgentTransport {
  // ── daemon seam primitives, re-exposed ────────────────────────────
  export const USERNAME = DaemonTransport.USERNAME;
  export const buildBasicAuthHeader = DaemonTransport.buildBasicAuthHeader;
  export const buildAuthToken = DaemonTransport.buildAuthToken;
  export const baseUrl = DaemonTransport.baseUrl;
  export const parseJson = DaemonTransport.parseJson;
  export const httpErrorFromResponse = DaemonTransport.httpErrorFromResponse;
  export const makeFetcher = DaemonTransport.makeFetcher;
  export const isNotFound = DaemonTransport.isNotFound;
  export const isUnauthorized = DaemonTransport.isUnauthorized;
  export const readFrames = DaemonTransport.readFrames;
  export const MAX_FRAME_BYTES = DaemonTransport.MAX_FRAME_BYTES;
  export const HttpError = DaemonTransport.HttpError;
  export type HttpError = DaemonTransport.HttpError;
  export type ErrorCode = DaemonTransport.ErrorCode;
  export type Fetcher = DaemonTransport.Fetcher;
  export type ClientOptions = DaemonTransport.ClientOptions;
  export type FrameHandler = DaemonTransport.FrameHandler;

  /** A 409 (or `provider_down`-coded) upstream-availability failure. */
  export function isUnavailable(err: unknown): err is HttpError {
    return (
      err instanceof DaemonTransport.HttpError &&
      (err.status === 409 || err.code === "provider_down")
    );
  }

  /**
   * Thrown when `POST /agent/run` opened a stream but never delivered the
   * in-band `grida-session` frame. We refuse to coerce to "" because a
   * silent empty id makes `useChatSession.currentId` stay null, so every
   * follow-up turn sends `sessionId: undefined` and the host mints a brand
   * new session (no continuity). Failing loud surfaces the broken contract
   * instead of silently degrading. See `GRIDA_SESSION_SSE_EVENT`.
   */
  export class MissingSessionIdError extends Error {
    constructor(public readonly route: string) {
      super(
        `[grida] ${route}: stream opened without a session id ` +
          `(no in-band grida-session frame)`
      );
      this.name = "AgentTransport.MissingSessionIdError";
    }
  }

  export type AgentStreamHandle = {
    session_id: string;
    done: Promise<void>;
  };

  /** Wire result of `POST /sessions/:id/compact`. Mirrors the runtime's
   *  `CompactionResult` without importing the server-only compaction
   *  module into this client-safe seam. */
  export type CompactSessionResult =
    | {
        compacted: true;
        summary_message_id: string;
        tail_start_id: string | null;
        summarized_count: number;
        summary_tokens: number;
        kept_turns: number;
        strategy: string;
      }
    | { compacted: false; reason: string };

  /**
   * The full agent-daemon client: the daemon groups (handshake, files,
   * recent, workspaces) by inheritance + the agent tenant's groups below.
   */
  export class Client extends DaemonTransport.Client {
    readonly secrets = {
      has: async (providerId: string): Promise<boolean> => {
        const res = await this.postJson<{ has: boolean }>("/secrets/has", {
          provider_id: providerId,
        });
        return res.has;
      },
      set: async (providerId: string, key: string): Promise<void> => {
        await this.postJson<unknown>("/secrets/set", {
          provider_id: providerId,
          key,
        });
      },
      delete: async (providerId: string): Promise<void> => {
        await this.postJson<unknown>("/secrets/delete", {
          provider_id: providerId,
        });
      },
    } as const;

    readonly providers = {
      /** Endpoint provider configs (issue #806) — readable plain config,
       *  unlike secrets. */
      list_endpoints: async (): Promise<EndpointProviderConfig[]> =>
        await this.postJson<EndpointProviderConfig[]>(
          "/providers/endpoints/list"
        ),
      set_endpoint: async (config: EndpointProviderConfig): Promise<void> => {
        await this.postJson<unknown>("/providers/endpoints/set", { config });
      },
      delete_endpoint: async (id: string): Promise<void> => {
        await this.postJson<unknown>("/providers/endpoints/delete", { id });
      },
      /** Where the endpoint config JSON lives on disk. */
      info: async (): Promise<{ path: string }> =>
        await this.postJson<{ path: string }>("/providers/endpoints/info"),
      /** Discover the models an endpoint serves (host-side fetch). */
      probe_endpoint: async (
        baseUrl: string
      ): Promise<{
        source: "ollama" | "openai";
        models: ProbedEndpointModel[];
      }> =>
        await this.postJson("/providers/endpoints/probe", {
          base_url: baseUrl,
        }),
      /** Is the user's `claude` CLI resolvable on the host (issue #813)?
       *  Cheap filesystem probe — NOT a login check. */
      detect_claude: async (): Promise<{
        installed: boolean;
        path?: string;
      }> => await this.postJson("/providers/claude/detect"),
    } as const;

    /** BYOK image generation (#908). Desktop-only; gated by the `images`
     *  capability. Returns base64 bytes — never the user's key. */
    readonly images = {
      generate: async (
        req: ImageGenerateRequest
      ): Promise<ImageGenerateResult> =>
        await this.postJson<ImageGenerateResult>("/images/generate", req),
    } as const;

    /** BYOK video generation (#908). Desktop-only; gated by the `video`
     *  capability. Returns a provider URL (or base64) — never the user's key. */
    readonly video = {
      generate: async (
        req: VideoGenerateRequest
      ): Promise<VideoGenerateResult> =>
        await this.postJson<VideoGenerateResult>("/video/generate", req),
    } as const;

    readonly sessions = {
      list: async (filter: SessionListFilter = {}): Promise<SessionListPage> =>
        await this.getJson<SessionListPage>(sessionListPath(filter)),
      get: async (id: string): Promise<ChatSessionRow | null> => {
        const path = `/sessions/${encodeURIComponent(id)}`;
        const res = await this.fetch(path, { method: "GET" });
        if (res.status === 404) return null;
        return await parseJson<ChatSessionRow>(res, path);
      },
      create: async (opts: CreateSessionOptions): Promise<ChatSessionRow> =>
        await this.postJson<ChatSessionRow>("/sessions", opts),
      patch: async (
        id: string,
        opts: PatchSessionOptions
      ): Promise<ChatSessionRow> =>
        await this.patchJson<ChatSessionRow>(
          `/sessions/${encodeURIComponent(id)}`,
          opts
        ),
      delete: async (id: string): Promise<void> => {
        await this.deleteJson<{ ok: true }>(
          `/sessions/${encodeURIComponent(id)}`
        );
      },
      list_messages: async (id: string): Promise<ChatMessageWithParts[]> =>
        await this.getJson<ChatMessageWithParts[]>(
          `/sessions/${encodeURIComponent(id)}/messages`
        ),
      /** Soft-truncate to a prior message (RFC `session / rewinding`).
       *  `restore: true` un-rewinds. */
      rewind: async (
        id: string,
        fromMessageId: string,
        opts: { restore?: boolean } = {}
      ): Promise<RewindResult> =>
        await this.postJson<RewindResult>(
          `/sessions/${encodeURIComponent(id)}/rewind`,
          { from_message_id: fromMessageId, restore: opts.restore }
        ),
      /** Fork the session at a message into a new session
       *  (RFC `session / fork`). Returns the new session row. */
      fork: async (
        id: string,
        fromMessageId: string,
        metadata?: Record<string, unknown>
      ): Promise<ChatSessionRow> =>
        await this.postJson<ChatSessionRow>(
          `/sessions/${encodeURIComponent(id)}/fork`,
          { from_message_id: fromMessageId, metadata }
        ),
      /** User-fired compaction (RFC `session / compaction`). */
      compact: async (id: string): Promise<CompactSessionResult> =>
        await this.postJson<CompactSessionResult>(
          `/sessions/${encodeURIComponent(id)}/compact`
        ),
      /** Queued sends (RFC `queue`): enqueue a pending user message. The
       *  caller mints the message id for its optimistic mirror; the CORE fires
       *  the row on a clean idle edge (the scheduler clears `queued_at`). */
      enqueue: async (
        id: string,
        message: { id?: string; text: string }
      ): Promise<ChatMessageWithParts> =>
        await this.postJson<ChatMessageWithParts>(
          `/sessions/${encodeURIComponent(id)}/queue`,
          { id: message.id, text: message.text }
        ),
      /** The pending queue, FIFO by `queued_at` (RFC `queue / order`). */
      list_queued: async (id: string): Promise<ChatMessageWithParts[]> =>
        await this.getJson<ChatMessageWithParts[]>(
          `/sessions/${encodeURIComponent(id)}/queue`
        ),
      /** Cancel a queued message before it fires (RFC `queue`). */
      cancel_queued: async (id: string, messageId: string): Promise<void> => {
        await this.deleteJson<{ ok: true }>(
          `/sessions/${encodeURIComponent(id)}/queue/${encodeURIComponent(messageId)}`
        );
      },
      /**
       * Subscribe to the session's `SessionStatus` back-channel (RFC
       * `session` §Session status). A long-lived SSE: the CURRENT status
       * arrives first, then every idle⇄busy⇄error transition. The returned
       * `done` settles when the subscription ends (the caller aborts via
       * `init.signal`, or the socket drops). Unknown/idle sessions read
       * `{ state: "idle" }`.
       */
      subscribe_status: async (
        id: string,
        onStatus: (status: SessionStatus) => void,
        init: { signal?: AbortSignal } = {}
      ): Promise<{ done: Promise<void> }> => {
        const route = `/sessions/${encodeURIComponent(id)}/status`;
        const res = await this.fetch(route, {
          method: "GET",
          headers: { accept: "text/event-stream" },
          signal: init.signal,
        });
        if (!res.ok || !res.body) {
          throw await httpErrorFromResponse(res, route);
        }
        const done = readFrames(res.body, (event, data) => {
          if (event !== GRIDA_STATUS_SSE_EVENT) return;
          try {
            onStatus(JSON.parse(data) as SessionStatus);
          } catch {
            /* malformed status frame — ignore */
          }
        });
        return { done };
      },
    } as const;

    readonly events = {
      /**
       * Subscribe to the host-wide lifecycle event stream (`GET /events`,
       * RFC `events.md`): every session's `turn-started` / `turn-finished` /
       * `approval-requested` on one long-lived SSE. Volatile — no initial
       * frame, no replay; a late joiner sees only future events. The
       * returned `done` settles when the subscription ends (the caller
       * aborts via `init.signal`, or the socket drops).
       */
      subscribe: async (
        onEvent: (event: AgentLifecycleEvent) => void,
        init: { signal?: AbortSignal } = {}
      ): Promise<{ done: Promise<void> }> => {
        const route = "/events";
        const res = await this.fetch(route, {
          method: "GET",
          headers: { accept: "text/event-stream" },
          signal: init.signal,
        });
        if (!res.ok || !res.body) {
          throw await httpErrorFromResponse(res, route);
        }
        const done = readFrames(res.body, (event, data) => {
          if (event !== GRIDA_EVENTS_SSE_EVENT) return;
          try {
            onEvent(JSON.parse(data) as AgentLifecycleEvent);
          } catch {
            /* malformed event frame — ignore */
          }
        });
        return { done };
      },
    } as const;

    readonly agent = {
      run: async (
        opts: AgentRunOptions,
        onChunk: (chunk: AgentUIMessageChunk) => void,
        init: { signal?: AbortSignal } = {}
      ): Promise<AgentStreamHandle> => {
        const handle = await this.openAgentStream(
          { kind: "run", opts },
          onChunk,
          init
        );
        if (handle === null) {
          throw new HttpError(
            "/agent/run",
            404,
            "Not Found",
            "stream not found"
          );
        }
        return handle;
      },
      reconnect: async (
        sessionId: string,
        lastEventId: number,
        onChunk: (chunk: AgentUIMessageChunk) => void,
        init: { signal?: AbortSignal } = {}
      ): Promise<AgentStreamHandle | null> =>
        await this.openAgentStream(
          {
            kind: "reconnect",
            session_id: sessionId,
            last_event_id: lastEventId,
          },
          onChunk,
          init
        ),
      abort: async (sessionId: string): Promise<void> => {
        await this.postJson<unknown>("/agent/abort", { session_id: sessionId });
      },
    } as const;

    private async openAgentStream(
      spec:
        | { kind: "run"; opts: AgentRunOptions }
        | { kind: "reconnect"; session_id: string; last_event_id: number },
      onChunk: (chunk: AgentUIMessageChunk) => void,
      init: { signal?: AbortSignal }
    ): Promise<AgentStreamHandle | null> {
      const route =
        spec.kind === "run"
          ? "/agent/run"
          : `/agent/stream/${encodeURIComponent(spec.session_id)}`;
      const headers =
        spec.kind === "run"
          ? {
              "content-type": "application/json",
              accept: "text/event-stream",
            }
          : reconnectHeaders(spec.last_event_id);
      const res = await this.fetch(route, {
        method: spec.kind === "run" ? "POST" : "GET",
        headers,
        body: spec.kind === "run" ? JSON.stringify(spec.opts) : undefined,
        signal: init.signal,
      });
      if (spec.kind === "reconnect" && res.status === 404) return null;
      if (!res.ok || !res.body) {
        throw await httpErrorFromResponse(res, route);
      }

      // Reconnect: the session id IS the path param. The server still emits
      // the in-band `grida-session` frame; `readAgentStream` drops it (no
      // `onSession`) so it never reaches the AI SDK reducer.
      if (spec.kind === "reconnect") {
        return {
          session_id: spec.session_id,
          done: readAgentStream(res.body, onChunk),
        };
      }

      // Run: the session id is the in-band `grida-session` frame (the first
      // frame of the body — see `GRIDA_SESSION_SSE_EVENT`). If the stream
      // settles without ever sending it, fail loud — never coerce to "",
      // which would make every follow-up turn mint a fresh session.
      let resolveInBand!: (sessionId: string) => void;
      const inBandSessionId = new Promise<string>((resolve) => {
        resolveInBand = resolve;
      });
      const done = readAgentStream(res.body, onChunk, (id) =>
        resolveInBand(id)
      );
      // Unblock the await if the stream settles without ever sending the
      // frame (resolve "" → the !sessionId check below throws). Both
      // settlements are handled here so a stream error can't leak as an
      // unhandled rejection on the throw path; the caller attaches its own
      // handler to `done` for the normal path.
      void done.then(
        () => resolveInBand(""),
        () => resolveInBand("")
      );
      const sessionId = await inBandSessionId;
      if (!sessionId) {
        throw new MissingSessionIdError(route);
      }
      return { session_id: sessionId, done };
    }
  }

  export function sessionListPath(filter: SessionListFilter = {}): string {
    const qs = new URLSearchParams();
    if (filter.agent) qs.set("agent", filter.agent);
    if (filter.workspace_id) qs.set("workspaceId", filter.workspace_id);
    if (filter.query) qs.set("q", filter.query);
    if (filter.include_archived) qs.set("includeArchived", "1");
    if (filter.limit !== undefined) qs.set("limit", String(filter.limit));
    if (filter.cursor) qs.set("cursor", filter.cursor);
    const search = qs.toString();
    return search ? `/sessions?${search}` : "/sessions";
  }

  function reconnectHeaders(lastEventId: number): Record<string, string> {
    const headers: Record<string, string> = { accept: "text/event-stream" };
    if (lastEventId > 0) headers["last-event-id"] = String(lastEventId);
    return headers;
  }

  export function parseAgentFrame(
    event: string,
    data: string,
    onChunk: (chunk: AgentUIMessageChunk) => void,
    onSession?: (sessionId: string) => void
  ): "chunk" | "done" | "session" | "ignored" {
    if (data === "[DONE]") return "done";
    // In-band session id. Consumed here; NEVER forwarded to `onChunk` — the
    // AI SDK reducer would reject an unknown chunk type.
    if (event === GRIDA_SESSION_SSE_EVENT) {
      try {
        const parsed = JSON.parse(data) as { session_id?: unknown };
        if (typeof parsed.session_id === "string" && parsed.session_id) {
          onSession?.(parsed.session_id);
        }
      } catch {
        // malformed session frame — ignore; the header may still resolve it
      }
      return "session";
    }
    try {
      onChunk(JSON.parse(data) as AgentUIMessageChunk);
      return "chunk";
    } catch {
      return "ignored";
    }
  }

  export async function readAgentStream(
    body: ReadableStream<Uint8Array>,
    onChunk: (chunk: AgentUIMessageChunk) => void,
    onSession?: (sessionId: string) => void
  ): Promise<void> {
    let done = false;
    await readFrames(body, (event, data) => {
      if (done) return;
      const result = parseAgentFrame(event, data, onChunk, onSession);
      if (result === "done") done = true;
    });
  }
}
