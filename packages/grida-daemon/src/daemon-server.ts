/**
 * DaemonServer — the daemon lifecycle owner.
 *
 * The architecture blueprint (docs/wg/ai/grida/architecture.md) makes
 * this the one class host adapters and the CLI construct,
 * `start()`, and `stop()`. The exposed contract is intentionally tiny:
 *
 *   - `constructor(opts)`  — wire config + the static tenant list.
 *   - `start()`            — build the Hono app + bind a loopback HTTP
 *                            socket; resolves once listening.
 *   - `stop()`             — drain in-flight tenant work, then close
 *                            per-launch state. Idempotent.
 *
 * The daemon owns the perimeter and its capability stores (files,
 * recents, workspaces, secrets store); everything else is a tenant
 * (issue #927) mounted through the `DaemonTenant` seam — the Grida AI
 * agent is one such tenant (`@grida/agent/server`), not the owner. The
 * public surface — `constructor / start / stop` — does not change when
 * internals move.
 */

import { serve } from "@hono/node-server";
import {
  buildServer,
  type BuiltServer,
  type DaemonTenant,
  type ServerOptions,
} from "./http/server";
import type { DaemonHttpAccess } from "./http/origin";
import {
  DAEMON_DEFAULT_CAPABILITIES,
  DAEMON_PROTOCOL,
  type DaemonCapabilities,
} from "./protocol/handshake";

export type DaemonServerOptions = {
  password: string;
  /** Override only when building a deliberately stripped daemon. */
  capabilities?: Partial<DaemonCapabilities>;
  /** Host-provided data directory for daemon persistent state. */
  user_data_path: string;
  /**
   * GRIDA-SEC-004 — host-injected managed root for the auto-create flow
   * (`POST /workspaces/create`). The desktop supervisor passes `~/Documents/Grida`;
   * CLI/dev leave it unset (auto-create then refuses). Forwarded to
   * {@link ServerOptions} by the `...opts` spread below.
   */
  projects_root?: string;
  /** Host/client HTTP perimeter policy for CORS + Referer checks. */
  http_access: DaemonHttpAccess;
  /** Loopback host to bind. Default `127.0.0.1`. */
  hostname?: string;
  /** Port to bind. Default `0` (OS picks a free ephemeral port). */
  port?: number;
  /**
   * Capability tenants to mount behind the perimeter — a static, typed
   * list the composer supplies (`@grida/agent/server` composes the agent
   * tenant). An empty list is a valid, bare daemon.
   */
  tenants?: readonly DaemonTenant[];
};

export class DaemonServer {
  private readonly hostname: string;
  private readonly desired_port: number;
  private readonly server_options: ServerOptions;

  private built: BuiltServer | null = null;
  private server: ReturnType<typeof serve> | null = null;
  private bound_port: number | null = null;
  private stopped = false;

  constructor(opts: DaemonServerOptions) {
    this.hostname = opts.hostname ?? "127.0.0.1";
    this.desired_port = opts.port ?? 0;
    this.server_options = {
      ...opts,
      protocol: DAEMON_PROTOCOL,
      capabilities: {
        ...DAEMON_DEFAULT_CAPABILITIES,
        ...opts.capabilities,
      },
    };
  }

  /** The port the HTTP server is bound to. Throws before `start()`. */
  get port(): number {
    if (this.bound_port === null) {
      throw new Error("DaemonServer.port read before start() bound a socket");
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
      built.drain();
      built.cleanup();
      this.bound_port = null;
      this.server = null;
      this.built = null;
      throw err;
    }
  }

  /**
   * Stop the daemon. Order matters:
   *   1. Stop accepting new connections (close the socket).
   *   2. Drain in-flight tenant work — e.g. the agent tenant aborts each
   *      upstream model call. Done BEFORE tenant cleanup so any recorder
   *      reacting to the abort can finalize its partial assistant message
   *      against an open SQLite handle.
   *   3. Close tenant + daemon per-launch state via the BuiltServer
   *      cleanup.
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

    // Drain in-flight tenant work (abort upstream) before closing stores.
    this.built?.drain();
    this.built?.cleanup();
  }
}
