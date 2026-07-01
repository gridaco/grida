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
  /**
   * Base directory for per-session scratch areas (WG `scratch.md`). Forwarded to
   * {@link ServerOptions} by the `...opts` spread; defaults to
   * `<os.tmpdir()>/grida-agent` at the server boundary when omitted. MUST be
   * outside `user_data_path`. Tests inject an isolated base so the startup sweep
   * stays hermetic.
   */
  scratch_base?: string;
  /**
   * Catalog model id the agent's `generate_image` tool produces with — the
   * user's selected image model. The tool is prompt-only (model is host config,
   * not an agent argument). Forwarded to {@link ServerOptions} by the `...opts`
   * spread; defaults to the catalog default when omitted.
   */
  image_model_id?: string;
  /** Host/client HTTP perimeter policy for CORS + Referer checks. */
  http_access: AgentHostHttpAccess;
  /** Loopback host to bind. Default `127.0.0.1`. */
  hostname?: string;
  /** Port to bind. Default `0` (OS picks a free ephemeral port). */
  port?: number;
  /**
   * GRIDA-SEC-004 — whether this host's process tree is confined by an OS
   * sandbox (srt Seatbelt/bubblewrap). Default `false` (FAIL-CLOSED): with no
   * sandbox and no explicit opt-in, the `run_command` shell tool is NOT
   * exposed to the model. The desktop supervisor sets this true only when it
   * actually wrapped the sidecar spawn.
   */
  sandbox_enforced?: boolean;
  /**
   * GRIDA-SEC-004 — deliberate escape hatch for hosts that run WITHOUT an OS
   * sandbox (the `grida-agent` CLI, local dev). When true, `run_command` is
   * exposed even though `sandbox_enforced` is false. Off by default; enabling
   * it is an explicit, logged decision by the host author who accepts that the
   * shell child has no kernel-level fs/network containment.
   */
  allow_unsandboxed_shell?: boolean;
  /**
   * Whether a human UI is bound to this host (RFC `tools` §question). When
   * true, the locked `question` tool pauses for the user's answer; when
   * false/undefined (fail-closed headless) it refuses with a fixed tool error.
   * The desktop sidecar sets this true; the CLI leaves it false. Carried into
   * {@link ServerOptions} by the `...opts` spread below.
   */
  interactive?: boolean;
  /**
   * Whether this host's clients can resolve a Grida Library search — gates the
   * `design_search` tool (client-resolved, like fs). The desktop sidecar sets
   * this true (its renderer wires the resolver); CLI/headless leave it false.
   * Carried into {@link ServerOptions} by the `...opts` spread.
   */
  library?: boolean;
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
