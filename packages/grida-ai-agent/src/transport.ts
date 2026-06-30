/**
 * GRIDA-SEC-004 — agent server HTTP transport shared by host adapters,
 * CLI clients, and Desktop preload.
 *
 * This module owns the public HTTP seam: route paths, request
 * serialization, JSON parsing, SSE stream decoding, and typed transport
 * errors. Consumers should not hand-build AgentHost route strings.
 */

import { GRIDA_SESSION_SSE_EVENT, type AgentRunOptions } from "./protocol/run";
import {
  GRIDA_STATUS_SSE_EVENT,
  type SessionStatus,
} from "./protocol/session-status";
import {
  GRIDA_EVENTS_SSE_EVENT,
  type AgentLifecycleEvent,
} from "./protocol/events";
import type { AgentServerHandshakeResponse } from "./protocol/handshake";
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
  FileReadResult,
  FileRegisterResult,
  FileWriteResult,
  RecentEntry,
  Workspace,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "./protocol/resources";
import type {
  EndpointProviderConfig,
  ProbedEndpointModel,
} from "./protocol/endpoints";

function base64(value: string): string {
  const g = globalThis as unknown as {
    btoa?: (input: string) => string;
    Buffer?: {
      from(
        input: string,
        encoding: string
      ): { toString: (encoding: string) => string };
    };
  };
  if (typeof g.btoa === "function") return g.btoa(value);
  if (g.Buffer) return g.Buffer.from(value, "utf8").toString("base64");
  throw new Error("[grida] no base64 encoder available");
}

export namespace AgentTransport {
  /** The fixed Basic-Auth username; the password is the host secret. */
  export const USERNAME = "agent" as const;

  export function buildBasicAuthHeader(password: string): string {
    return `Basic ${base64(`${USERNAME}:${password}`)}`;
  }

  /**
   * GRIDA-SEC-004 — the `auth_token` query value for header-less
   * event-stream attaches (native `EventSource`). The SAME base64 payload
   * the Basic header carries; the server accepts it on GET SSE routes
   * only. URL-encode when interpolating into a query string.
   */
  export function buildAuthToken(password: string): string {
    return base64(`${USERNAME}:${password}`);
  }

  export function baseUrl(port: number): string {
    return `http://127.0.0.1:${port}`;
  }

  export type ErrorCode = string;

  export class HttpError extends Error {
    constructor(
      public readonly route: string,
      public readonly status: number,
      public readonly statusText: string,
      message: string,
      public readonly code?: ErrorCode
    ) {
      super(`[grida] ${route}: ${message}`);
      this.name = "AgentTransport.HttpError";
    }
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

  export function isNotFound(err: unknown): err is HttpError {
    return err instanceof HttpError && err.status === 404;
  }

  export function isUnauthorized(err: unknown): err is HttpError {
    return err instanceof HttpError && err.status === 401;
  }

  export function isUnavailable(err: unknown): err is HttpError {
    return (
      err instanceof HttpError &&
      (err.status === 409 || err.code === "provider_down")
    );
  }

  /**
   * Shared JSON-response parser used by every agent server caller.
   * Surfaces `{error, code}` from the body when the server returned one;
   * falls back to the HTTP status line when the body is absent.
   */
  export async function parseJson<T>(res: Response, route: string): Promise<T> {
    if (!res.ok) {
      throw await httpErrorFromResponse(res, route);
    }
    return (await res.json()) as T;
  }

  export async function httpErrorFromResponse(
    res: Response,
    route: string
  ): Promise<HttpError> {
    let message = `${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: unknown; code?: unknown };
      if (typeof data?.error === "string") message = data.error;
      if (typeof data?.code === "string") code = data.code;
    } catch {
      // body not JSON — keep the status line
    }
    return new HttpError(route, res.status, res.statusText, message, code);
  }

  export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

  /**
   * Browser clients only (Node fetch ignores this): pages served with
   * `Referrer-Policy: no-referrer` (e.g. `/desktop/*`, GRIDA-SEC-004)
   * would otherwise strip the Referer the server's guard requires. One
   * policy for every transport fetch path — `makeFetcher` and
   * `Client.fetch` must never diverge here.
   */
  const REFERRER_POLICY: RequestInit["referrerPolicy"] = "unsafe-url";

  /**
   * Host-adapter fetch factory. Holds the host-supplied password in closure
   * so the caller can expose only a narrowed bridge/client surface.
   */
  export function makeFetcher({
    port,
    password,
  }: {
    port: number;
    password: string;
  }): Fetcher {
    if (!port || !password) {
      return () =>
        Promise.reject(new Error("[grida] agent server credentials missing"));
    }
    const base = baseUrl(port);
    const authorization = buildBasicAuthHeader(password);
    return async function agentServerFetch(
      path: string,
      init: RequestInit = {}
    ) {
      const headers = new Headers(init.headers ?? {});
      headers.set("authorization", authorization);
      return await fetch(`${base}${path}`, {
        ...init,
        headers,
        credentials: "omit",
        referrerPolicy: REFERRER_POLICY,
      });
    };
  }

  export type ClientOptions =
    | {
        base_url: string;
        password: string;
        origin?: string;
        referer?: string;
        fetch?: typeof fetch;
        fetcher?: never;
      }
    | {
        fetcher: Fetcher;
        base_url?: never;
        password?: never;
        origin?: never;
        referer?: never;
        fetch?: never;
      };

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

  export class Client {
    private readonly custom_fetcher: Fetcher | null;
    private readonly base: string;
    private readonly authorization: string | null;
    private readonly origin: string | undefined;
    private readonly referer: string | undefined;
    private readonly fetch_impl: typeof fetch;

    constructor(opts: ClientOptions) {
      // The default MUST be receiver-bound: storing the global `fetch` on a
      // property and calling `this.fetch_impl(...)` would invoke it with the
      // Client as `this`, which a real browser rejects ("Illegal invocation").
      // Node's fetch tolerates any receiver, so only browser clients see it —
      // pinned by the browser-engine harness (perimeter.browser.test.ts).
      const boundFetch: typeof fetch = (input, init) =>
        globalThis.fetch(input, init);
      if ("fetcher" in opts) {
        this.custom_fetcher = opts.fetcher ?? null;
        this.base = "";
        this.authorization = null;
        this.origin = undefined;
        this.referer = undefined;
        this.fetch_impl = boundFetch;
      } else {
        this.custom_fetcher = null;
        this.base = opts.base_url.replace(/\/$/, "");
        this.authorization = buildBasicAuthHeader(opts.password);
        this.origin = opts.origin;
        this.referer = opts.referer;
        this.fetch_impl = opts.fetch ?? boundFetch;
      }
    }

    async fetch(path: string, init: RequestInit = {}): Promise<Response> {
      if (this.custom_fetcher) return await this.custom_fetcher(path, init);
      const headers = new Headers(init.headers ?? {});
      headers.set("authorization", this.authorization!);
      if (this.origin) headers.set("origin", this.origin);
      if (this.referer) headers.set("referer", this.referer);
      return await this.fetch_impl(`${this.base}${path}`, {
        ...init,
        headers,
        credentials: "omit",
        referrerPolicy: REFERRER_POLICY,
      });
    }

    async postJson<T>(path: string, body?: unknown): Promise<T> {
      const res = await this.fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return await parseJson<T>(res, path);
    }

    async getJson<T>(path: string): Promise<T> {
      const res = await this.fetch(path, { method: "GET" });
      return await parseJson<T>(res, path);
    }

    async patchJson<T>(path: string, body?: unknown): Promise<T> {
      const res = await this.fetch(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return await parseJson<T>(res, path);
    }

    async deleteJson<T>(path: string): Promise<T> {
      const res = await this.fetch(path, { method: "DELETE" });
      return await parseJson<T>(res, path);
    }

    async handshake(): Promise<AgentServerHandshakeResponse> {
      return await this.postJson<AgentServerHandshakeResponse>("/handshake");
    }

    readonly files = {
      register: async (path: string): Promise<FileRegisterResult> =>
        await this.postJson<FileRegisterResult>("/files/register", { path }),
      read: async (docId: string): Promise<FileReadResult> =>
        await this.postJson<FileReadResult>("/files/read", { doc_id: docId }),
      write: async (docId: string, content: string): Promise<FileWriteResult> =>
        await this.postJson<FileWriteResult>("/files/write", {
          doc_id: docId,
          content,
        }),
    } as const;

    readonly recent = {
      list: async (): Promise<RecentEntry[]> =>
        await this.postJson<RecentEntry[]>("/recent/list"),
      touch: async (path: string): Promise<void> => {
        await this.postJson<unknown>("/recent/touch", { path });
      },
      pin: async (path: string, pinned: boolean): Promise<void> => {
        await this.postJson<unknown>("/recent/pin", { path, pinned });
      },
      forget: async (path: string): Promise<void> => {
        await this.postJson<unknown>("/recent/forget", { path });
      },
    } as const;

    readonly workspaces = {
      list: async (): Promise<Workspace[]> =>
        await this.postJson<Workspace[]>("/workspaces/list"),
      open: async (rootPath: string): Promise<Workspace> =>
        await this.postJson<Workspace>("/workspaces/open", { path: rootPath }),
      pin: async (id: string, pinned: boolean): Promise<void> => {
        await this.postJson<unknown>("/workspaces/pin", { id, pinned });
      },
      forget: async (id: string): Promise<void> => {
        await this.postJson<unknown>("/workspaces/forget", { id });
      },
      readdir: async (
        workspaceId: string,
        relPath = ""
      ): Promise<WorkspaceFsEntry[]> =>
        await this.postJson<WorkspaceFsEntry[]>("/workspaces/readdir", {
          workspace_id: workspaceId,
          rel_path: relPath,
        }),
      read_file: async (
        workspaceId: string,
        relPath: string
      ): Promise<WorkspaceReadFileResult> =>
        await this.postJson<WorkspaceReadFileResult>("/workspaces/readfile", {
          workspace_id: workspaceId,
          rel_path: relPath,
        }),
      read_file_bytes: async (
        workspaceId: string,
        relPath: string
      ): Promise<WorkspaceReadFileBytesResult> =>
        await this.postJson<WorkspaceReadFileBytesResult>(
          "/workspaces/readfilebytes",
          { workspace_id: workspaceId, rel_path: relPath }
        ),
      write_file: async (
        workspaceId: string,
        relPath: string,
        content: string,
        // Optimistic-concurrency token (issue #805): the mtime the caller
        // last observed. Omitted → last-writer-wins; present → the host
        // rejects with 409 `modified-since` if disk has advanced.
        expectedMtime?: number
      ): Promise<WorkspaceWriteFileResult> =>
        await this.postJson<WorkspaceWriteFileResult>("/workspaces/writefile", {
          workspace_id: workspaceId,
          rel_path: relPath,
          content,
          expected_mtime: expectedMtime,
        }),
    } as const;

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

  export type FrameHandler = (event: string, data: string) => void;

  /**
   * Ceiling on a single UN-TERMINATED SSE frame's tail — a stall detector (an
   * upstream that streams forever without a `\n\n` boundary). It must clear the
   * LARGEST LEGITIMATE single frame: an image-bearing tool result
   * (`view_image`, `generate_image`) carries the image as base64 in ONE frame,
   * up to `AgentVision.MAX_BYTES` (8 MiB) of source → ~11 MiB base64 + the JSON
   * envelope. 16 MiB leaves headroom while still bounding a real stall. If the
   * image ceiling rises, this must too — pinned by a contract test in
   * `transport.test.ts` (`MAX_FRAME_BYTES > base64(AgentVision.MAX_BYTES)`).
   * Exported so that test can assert the relationship directly.
   */
  export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

  export async function readFrames(
    body: ReadableStream<Uint8Array>,
    onFrame: FrameHandler
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;
        buffer += decoder.decode(value, { stream: true });
        for (;;) {
          const sep = buffer.indexOf("\n\n");
          if (sep === -1) break;
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = "message";
          // Accumulate consecutive `data:` lines joined with "\n", mirroring
          // the server's join (runtime/sse.ts). Overwriting on each line would
          // silently drop all but the last line of a multi-line payload.
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.length === 0 || line.startsWith(":")) continue;
            if (line.startsWith("event:")) {
              // SSE field value: strip a single leading space after the colon.
              event = line.slice("event:".length).replace(/^ /, "");
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice("data:".length).replace(/^ /, ""));
            }
          }
          const data = dataLines.join("\n");
          if (data.length > 0) onFrame(event, data);
        }
        // Cap only the UN-TERMINATED tail (what's left after the last "\n\n"),
        // not the whole buffer — complete frames have already been drained, so
        // a large legitimate replay burst on reconnect must not false-trip.
        if (buffer.length > MAX_FRAME_BYTES) {
          throw new Error(
            `[grida-sse] frame exceeds ${MAX_FRAME_BYTES} bytes — upstream stalled`
          );
        }
      }
    } catch (err) {
      if (isAbortError(err)) return;
      throw err;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
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

function isAbortError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { name?: unknown }).name === "AbortError";
}
