/**
 * AgentHost — the agent server lifecycle owner.
 *
 * The architecture blueprint (docs/wg/ai/grida/architecture.md) makes
 * this the one class host adapters and the CLI construct,
 * `start()`, and `stop()`. The exposed contract is intentionally tiny:
 *
 *   - `constructor(opts)`  — wire config; allocate the in-flight
 *                            run registry.
 *   - `start()`            — build the Hono app + bind a loopback HTTP
 *                            socket; resolves once listening.
 *   - `stop()`             — drain in-flight runs, then close SQLite +
 *                            the rest of per-launch state. Idempotent.
 *
 * The collaborators the architecture doc lists (sessions, BYOK providers,
 * workspaces, secrets, files, shell, runtime) are constructed behind
 * this lifecycle owner. The public surface — `constructor / start / stop`
 * — does not change when internals move.
 */

import { serve } from "@hono/node-server";
import {
  buildServer,
  type BuiltServer,
  type ServerOptions,
} from "./http/server";
import { StreamRegistry } from "./runtime/stream-registry";
import {
  AGENT_SERVER_DEFAULT_CAPABILITIES,
  AGENT_SERVER_PROTOCOL,
  type AgentServerCapabilities,
} from "./protocol/handshake";

export type AgentHostHttpAccess = {
  /** Browser origins allowed to receive CORS responses from the loopback server. */
  allowed_origins: readonly string[];
  /** Client route roots allowed to call the agent server. */
  allowed_referer_paths: readonly string[];
};

export type AgentHostOptions = {
  password: string;
  /** Override only when building a deliberately stripped host. */
  capabilities?: Partial<AgentServerCapabilities>;
  /** Host-provided data directory for agent host persistent state. */
  user_data_path: string;
  /** Host/client HTTP perimeter policy for CORS + Referer checks. */
  http_access: AgentHostHttpAccess;
  /** Loopback host to bind. Default `127.0.0.1`. */
  hostname?: string;
  /** Port to bind. Default `0` (OS picks a free ephemeral port). */
  port?: number;
};

export class AgentHost {
  private readonly hostname: string;
  private readonly desired_port: number;
  private readonly server_options: ServerOptions;
  private readonly streams: StreamRegistry;

  /**
   * In-flight run registry. Private by design: callers control lifecycle
   * through start/stop and the HTTP/client surface, not runtime internals.
   */
  private built: BuiltServer | null = null;
  private server: ReturnType<typeof serve> | null = null;
  private bound_port: number | null = null;
  private stopped = false;

  constructor(opts: AgentHostOptions) {
    this.hostname = opts.hostname ?? "127.0.0.1";
    this.desired_port = opts.port ?? 0;
    this.streams = new StreamRegistry();
    // Always hand the HTTP server our registry so drain on stop() reaches
    // the same entries the route created.
    this.server_options = {
      ...opts,
      protocol: AGENT_SERVER_PROTOCOL,
      capabilities: {
        ...AGENT_SERVER_DEFAULT_CAPABILITIES,
        ...opts.capabilities,
      },
      stream_registry: this.streams,
    };
  }

  /** The port the HTTP server is bound to. Throws before `start()`. */
  get port(): number {
    if (this.bound_port === null) {
      throw new Error("AgentHost.port read before start() bound a socket");
    }
    return this.bound_port;
  }

  /**
   * Build the app and bind a loopback HTTP socket. Resolves once the
   * server is listening (and `port` is readable). Rejects on a bind
   * failure (port in use, permissions). Calling twice is a no-op after
   * the first successful bind.
   */
  async start(): Promise<void> {
    if (this.built) return;
    const built = buildServer(this.server_options);
    let server: ReturnType<typeof serve> | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const fail = (err: unknown) => {
          if (settled) return;
          settled = true;
          reject(err);
        };
        const ready = (port: number) => {
          if (settled) return;
          settled = true;
          this.bound_port = port;
          resolve();
        };
        try {
          server = serve(
            {
              fetch: built.app.fetch,
              hostname: this.hostname,
              port: this.desired_port,
            },
            (info) => ready(info.port)
          );
          // A bind error (EADDRINUSE, EACCES) surfaces here before the
          // listening callback fires — reject so callers don't hang.
          server.once("error", fail);
        } catch (err) {
          fail(err);
        }
      });
      this.built = built;
      this.server = server;
    } catch (err) {
      (server as ReturnType<typeof serve> | null)?.close();
      built.cleanup();
      this.bound_port = null;
      this.server = null;
      this.built = null;
      throw err;
    }
  }

  /**
   * Stop the host. Order matters:
   *   1. Stop accepting new connections (close the socket).
   *   2. Drain in-flight runs — abort each upstream model call. Done
   *      BEFORE the DB closes so any recorder reacting to the abort
   *      can finalize its partial assistant message against an open
   *      SQLite handle.
   *   3. Close SQLite + the rest of per-launch state (PKCE prune
   *      timer, etc.) via the BuiltServer cleanup.
   *
   * Idempotent: a second call returns immediately.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    const server = this.server;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Force idle keep-alive sockets closed so `close()` fires its
        // callback promptly instead of waiting out their timeouts.
        (
          server as unknown as { close_all_connections?: () => void }
        ).close_all_connections?.();
      });
      this.server = null;
    }

    // Drain in-flight runs (abort upstream) before closing the DB.
    this.streams.clear();

    // cleanup() closes PKCE timers, drains runtime resources, and closes
    // sessions storage.
    this.built?.cleanup();
  }
}
