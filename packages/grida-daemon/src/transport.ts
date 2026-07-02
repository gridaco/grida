/**
 * GRIDA-SEC-004 — daemon HTTP transport shared by host adapters, CLI
 * clients, and Desktop preload.
 *
 * This module owns the daemon half of the public HTTP seam: Basic-Auth
 * signing, fetch plumbing, SSE frame decoding, typed transport errors,
 * and the client methods for the daemon-owned route groups (handshake,
 * files, recents, workspaces). Tenant route groups extend this client —
 * see `@grida/agent/transport`'s `AgentTransport.Client`. Consumers
 * should not hand-build daemon route strings.
 */

import type { DaemonHandshakeResponse } from "./protocol/handshake";
import type {
  FileReadResult,
  FileRegisterResult,
  FileWriteResult,
  RecentEntry,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "./protocol/resources";

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

export namespace DaemonTransport {
  /** The fixed Basic-Auth username; the password is the host secret.
   *  Wire constant of protocol 1 — the value predates the daemon split. */
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
      this.name = "DaemonTransport.HttpError";
    }
  }

  export function isNotFound(err: unknown): err is HttpError {
    return err instanceof HttpError && err.status === 404;
  }

  export function isUnauthorized(err: unknown): err is HttpError {
    return err instanceof HttpError && err.status === 401;
  }

  /**
   * Shared JSON-response parser used by every daemon caller.
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
        Promise.reject(new Error("[grida] daemon credentials missing"));
    }
    const base = baseUrl(port);
    const authorization = buildBasicAuthHeader(password);
    return async function daemonFetch(path: string, init: RequestInit = {}) {
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

    async handshake(): Promise<DaemonHandshakeResponse> {
      return await this.postJson<DaemonHandshakeResponse>("/handshake");
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
      // Auto-create a fresh project (managed root, seeded `.canvas` board) and
      // register it. Powers the desktop home's "auto-create, ask nothing" flow.
      create: async (input: WorkspaceCreateInput): Promise<Workspace> =>
        await this.postJson<Workspace>("/workspaces/create", input),
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
  }

  export type FrameHandler = (event: string, data: string) => void;

  /**
   * Ceiling on a single UN-TERMINATED SSE frame's tail — a stall detector (an
   * upstream that streams forever without a `\n\n` boundary). It must clear
   * the LARGEST LEGITIMATE single frame any tenant emits: the agent tenant's
   * image-bearing tool results (`view_image`, `generate_image`) carry the
   * image as base64 in ONE frame, up to `AgentVision.MAX_BYTES` (8 MiB) of
   * source → ~11 MiB base64 + the JSON envelope. 16 MiB leaves headroom while
   * still bounding a real stall. If the image ceiling rises, this must too —
   * pinned by a contract test in `@grida/agent`'s `transport.test.ts`
   * (`MAX_FRAME_BYTES > base64(AgentVision.MAX_BYTES)`). Exported so that
   * test can assert the relationship directly.
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
          // the server's join (the agent runtime's sse.ts). Overwriting on
          // each line would silently drop all but the last line of a
          // multi-line payload.
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
}

function isAbortError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { name?: unknown }).name === "AbortError";
}
