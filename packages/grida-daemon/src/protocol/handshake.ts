/**
 * Handshake protocol — capability negotiation a client performs against
 * the daemon. Client-safe: capability flags + the response shape, no
 * server internals.
 *
 * The capability KEYS are the wire vocabulary of protocol 1 and include
 * tenant-mounted route groups (`agent`, `sessions`, `providers`, `images`,
 * `video`, `secrets`) alongside the daemon's own (`files`, `recent`,
 * `workspaces`). The daemon does not implement the tenant groups — a
 * registered tenant reports them at mount time (see `DaemonTenant` in
 * `http/server.ts`) — but the wire shape is one flat record so protocol 1
 * clients keep parsing it unchanged.
 */

export type DaemonCapabilities = {
  files: boolean;
  recent: boolean;
  secrets: boolean;
  agent: boolean;
  workspaces: boolean;
  sessions: boolean;
  /**
   * `/providers/endpoints/*` — endpoint provider config CRUD (issue
   * #806). Optional so older host-supplied capability shapes stay valid;
   * clients treat a missing flag as "not served".
   */
  providers?: boolean;
  /**
   * `/images/generate` — BYOK image generation (#908). Optional so older
   * host-supplied capability shapes stay valid; clients treat a missing flag
   * as "not served" and hide the image-generation UI.
   */
  images?: boolean;
  /**
   * `/video/generate` — BYOK video generation (#908). Optional so older
   * host-supplied capability shapes stay valid; clients treat a missing flag
   * as "not served" and hide the video-generation UI.
   */
  video?: boolean;
  /** Reserved for future `/shell/*` route group; always `false` in V1. */
  shell: boolean;
};

export const DAEMON_PROTOCOL = 1 as const;

/**
 * The daemon's OWN capability defaults — only the route groups the daemon
 * itself implements. Tenant groups (`agent`, `sessions`, `secrets`,
 * `providers`, `images`, `video`) default off and are merged in from each
 * registered tenant's handle. The composed agent-daemon default (everything
 * on) lives with the tenant: `@grida/agent/server`.
 */
export const DAEMON_DEFAULT_CAPABILITIES: DaemonCapabilities = {
  files: true,
  recent: true,
  workspaces: true,
  secrets: false,
  agent: false,
  sessions: false,
  providers: false,
  images: false,
  video: false,
  shell: false,
};

export type DaemonHandshakeResponse = {
  /** Wire-protocol version. Bumped only on incompatible changes. */
  protocol: number;
  /** Feature tags the daemon currently serves (e.g. `files@1`). */
  supports: string[];
  /** Daemon route capabilities. Host/native bridge caps are separate. */
  capabilities: DaemonCapabilities;
};
