/**
 * DaemonServer — the daemon lifecycle owner.
 * GRIDA-SEC-004 — the authenticated perimeter is identical in listening and
 * socketless host-delivered modes; socket ownership cannot bypass middleware.
 *
 * The architecture blueprint (docs/wg/ai/grida/architecture.md) makes
 * this the one class host adapters and the CLI construct, start, deliver
 * Requests through, and stop. The exposed contract is intentionally tiny:
 *
 *   - `constructor(opts)` — wire config + the static tenant list.
 *   - `start()`           — build the Hono app and, by default, bind a
 *                           loopback HTTP socket. A host-owned transport may
 *                           start without a listener.
 *   - `fetch(request)`    — deliver a standard Request through the same Hono
 *                           perimeter after a successful start.
 *   - `stop()`            — drain in-flight tenant work, then close
 *                           per-launch state. Idempotent.
 *
 * The daemon owns the perimeter and its capability stores (files,
 * recents, workspaces, secrets store); everything else is a tenant
 * (issue #927) mounted through the `DaemonTenant` seam — the Grida AI
 * agent is one such tenant (`@grida/agent/server`), not the owner. The
 * public surface — `constructor / start / fetch / stop` — does not change
 * when internals move.
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

type ActiveDaemonRequest = {
  abort_controller: AbortController;
  cancel_response: ((reason?: unknown) => Promise<void>) | null;
  settled: Promise<void>;
};

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
  /** Loopback host to bind in listening mode. Default `127.0.0.1`. */
  hostname?: string;
  /** Port to bind in listening mode. Default `0` (OS picks a free port). */
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
  private lifecycle: "idle" | "starting" | "started" | "stopping" | "stopped" =
    "idle";
  private listen_mode: boolean | null = null;
  private start_promise: Promise<void> | null = null;
  private stop_promise: Promise<void> | null = null;
  private readonly active_requests = new Set<ActiveDaemonRequest>();

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

  /** The bound HTTP port. Refuses when no listener is active. */
  get port(): number {
    if (this.bound_port === null) {
      throw new Error("DaemonServer.port requires a bound listener");
    }
    return this.bound_port;
  }

  /**
   * Build the app and, by default, bind a loopback HTTP socket. Resolves once
   * the lifecycle is ready; in listening mode, that means the socket is
   * accepting connections and `port` is readable.
   *
   * `listen: false` starts the same app, perimeter, tenants, and lifecycle
   * without creating a socket. The host can then deliver standard Requests
   * through {@link fetch}. The selected mode is immutable for this instance:
   * repeated starts in the same mode are idempotent; a conflicting mode or a
   * start after shutdown refuses.
   */
  start(options: { listen?: boolean } = {}): Promise<void> {
    const listen = options.listen ?? true;

    if (this.lifecycle === "stopping" || this.lifecycle === "stopped") {
      return Promise.reject(
        new Error("DaemonServer.start refused after shutdown began")
      );
    }

    if (this.lifecycle === "starting" || this.lifecycle === "started") {
      if (this.listen_mode !== listen) {
        return Promise.reject(
          new Error(
            `DaemonServer.start cannot change listen mode from ${String(
              this.listen_mode
            )} to ${String(listen)}`
          )
        );
      }
      return this.start_promise ?? Promise.resolve();
    }

    this.lifecycle = "starting";
    this.listen_mode = listen;
    const startPromise = this.startInternal(listen).then(
      () => {
        if (this.lifecycle === "starting") this.lifecycle = "started";
        this.start_promise = null;
      },
      (err) => {
        if (this.lifecycle === "starting") this.lifecycle = "idle";
        this.listen_mode = null;
        this.start_promise = null;
        throw err;
      }
    );
    this.start_promise = startPromise;
    return startPromise;
  }

  private async startInternal(listen: boolean): Promise<void> {
    const built = buildServer(this.server_options);
    if (!listen) {
      this.built = built;
      return;
    }

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
   * Deliver a standard Request through the daemon's Hono app. This is the
   * listener-independent request boundary: it preserves the exact middleware,
   * routes, and tenant behavior used by the Node HTTP adapter.
   *
   * Refuses unless {@link start} completed successfully and shutdown has not
   * begun. Response bodies remain part of the active request until consumed,
   * canceled, or errored; shutdown aborts/cancels and joins them before tenant
   * cleanup. The caller owns serialization and transport outside this method.
   */
  async fetch(request: Request): Promise<Response> {
    if (this.lifecycle !== "started" || this.built === null) {
      throw new Error("DaemonServer.fetch requires a running daemon");
    }

    const built = this.built;
    const abortController = new AbortController();
    const signal = AbortSignal.any([request.signal, abortController.signal]);
    const deliveredRequest = new Request(request, { signal });

    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });
    const active: ActiveDaemonRequest = {
      abort_controller: abortController,
      cancel_response: null,
      settled,
    };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", onAbort);
      this.active_requests.delete(active);
      resolveSettled();
    };
    const onAbort = () => {
      const cancel = active.cancel_response;
      if (cancel) void cancel(signal.reason).catch(() => {});
    };

    this.active_requests.add(active);
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      if (signal.aborted) throw signal.reason;
      const response = await built.app.fetch(deliveredRequest);

      // A stop or caller abort may have happened while the handler was
      // producing headers. Never return a post-shutdown body; cancel it and
      // keep the request active until cancellation completes.
      if (signal.aborted) {
        try {
          await response.body?.cancel(signal.reason);
        } finally {
          finish();
        }
        throw signal.reason;
      }

      if (response.body === null) {
        finish();
        return response;
      }

      const reader = response.body.getReader();
      let cancelPromise: Promise<void> | null = null;
      const cancel = (reason?: unknown): Promise<void> => {
        if (cancelPromise) return cancelPromise;
        cancelPromise = (async () => {
          try {
            await reader.cancel(reason);
          } finally {
            finish();
          }
        })();
        return cancelPromise;
      };
      active.cancel_response = cancel;

      const body = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              finish();
              controller.close();
              return;
            }
            controller.enqueue(chunk.value);
          } catch (err) {
            finish();
            controller.error(err);
          }
        },
        cancel,
      });

      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (err) {
      // If response wrapping itself failed after locking the original body,
      // release that body before removing the lifecycle record.
      await active.cancel_response?.(err).catch(() => {});
      finish();
      throw err;
    }
  }

  /**
   * Stop the daemon. Order matters:
   *   1. Refuse new Requests and close the socket when one is present.
   *   2. Drain in-flight tenant work — e.g. the agent tenant aborts each
   *      upstream model call. Done BEFORE tenant cleanup so any recorder
   *      reacting to the abort can finalize its partial assistant message
   *      against an open SQLite handle.
   *   3. Abort direct Request handlers, cancel their returned Response bodies,
   *      and wait for both to settle.
   *   4. Close tenant + daemon per-launch state via the BuiltServer
   *      cleanup.
   *
   * Idempotent: concurrent and later calls share or observe the same shutdown.
   */
  stop(): Promise<void> {
    if (this.lifecycle === "stopped") return Promise.resolve();
    if (this.lifecycle === "stopping") {
      return this.stop_promise ?? Promise.resolve();
    }

    const pendingStart = this.start_promise;
    this.lifecycle = "stopping";
    const stopPromise = this.stopInternal(pendingStart).then(
      () => {
        this.lifecycle = "stopped";
        this.stop_promise = null;
      },
      (err) => {
        this.lifecycle = "stopped";
        this.stop_promise = null;
        throw err;
      }
    );
    this.stop_promise = stopPromise;
    return stopPromise;
  }

  private async stopInternal(
    pendingStart: Promise<void> | null
  ): Promise<void> {
    // If shutdown races start, let the one in-flight construction settle so
    // every resource it created is included in this same cleanup pass. New
    // fetches are already refused because the lifecycle is `stopping`.
    try {
      await pendingStart;
    } catch {
      // A failed start performs its own partial cleanup. Shutdown still
      // completes and permanently closes this lifecycle instance.
    }

    const server = this.server;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Force idle keep-alive sockets closed so `close()` fires its
        // callback promptly instead of waiting out their timeouts.
        (
          server as unknown as { closeAllConnections?: () => void }
        ).closeAllConnections?.();
      });
      this.server = null;
    }

    this.bound_port = null;
    const built = this.built;
    this.built = null;

    // Drain in-flight tenant work (abort upstream) before closing stores.
    if (built) {
      const failures: unknown[] = [];
      try {
        built.drain();
      } catch (err) {
        failures.push(err);
      }

      // Direct Request delivery outlives the initial app.fetch() when its
      // Response body streams. Abort handlers, cancel returned bodies, and
      // wait for both to settle before tenant stores are closed.
      await this.cancelActiveRequests();

      try {
        built.cleanup();
      } catch (err) {
        failures.push(err);
      }

      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(failures, "DaemonServer shutdown failed");
      }
    }
  }

  private async cancelActiveRequests(): Promise<void> {
    const active = Array.from(this.active_requests);
    if (active.length === 0) return;

    const reason = new DOMException("DaemonServer stopped", "AbortError");
    for (const request of active) request.abort_controller.abort(reason);
    await Promise.allSettled(
      active.map((request) => request.cancel_response?.(reason))
    );
    await Promise.all(active.map((request) => request.settled));
  }
}
