// GRIDA-GG: provider — the `gg` daemon capability flag (docs/wg/platform/hosted-ai.md)
/**
 * Handshake protocol — capability negotiation a client performs against
 * the daemon. Client-safe: capability flags + the response shape, no
 * server internals.
 *
 * The capability KEYS are the wire vocabulary of protocol 1 and include
 * tenant-mounted route groups (`providers`, `images`, `video`, `three_d`,
 * `music`, `sound_effects`, `text_to_speech`, `secrets`, `gg`) alongside the
 * daemon's own (`files`, `recent`, `workspaces`). The daemon does
 * not implement the tenant groups — a registered tenant reports them at mount
 * time (see `DaemonTenant` in `http/server.ts`) — but the wire shape is one flat
 * record so protocol 1 clients keep parsing it unchanged.
 */

export type DaemonCapabilities = {
  files: boolean;
  recent: boolean;
  secrets: boolean;
  workspaces: boolean;
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
  /**
   * `/three-d/generate` — BYOK 3D generation. Optional so older hosts remain
   * compatible; clients treat a missing flag as "not served".
   */
  three_d?: boolean;
  /**
   * `/audio/music/generate` — hosted Lyria music generation. Optional so
   * host-supplied stripped capability shapes remain valid; clients treat a
   * missing flag as "not served".
   */
  music?: boolean;
  /**
   * `/audio/sound-effects/generate` — ElevenLabs BYOK Sound Effects generation.
   * Optional so host-supplied stripped capability shapes remain valid; clients
   * treat a missing flag as "not served".
   */
  sound_effects?: boolean;
  /**
   * `/audio/text-to-speech/*` — ElevenLabs BYOK voice listing and Text to
   * Speech generation. Optional so older hosts remain compatible; clients
   * treat a missing flag as "not served".
   */
  text_to_speech?: boolean;
  /**
   * `/auth/gg/*` — the Grida hosted ("included") AI session
   * (GRIDA-SEC-006). True only when the host configured a hosted base
   * URL. Optional so older host-supplied capability shapes stay valid;
   * clients treat a missing flag as "not served" and show no hosted-AI
   * affordances. Type-only from the daemon's perspective — the routes
   * and store live in the media tenant.
   */
  gg?: boolean;
};

export const DAEMON_PROTOCOL = 1 as const;

/**
 * The daemon's OWN capability defaults — only the route groups the daemon
 * itself implements. Tenant groups (`secrets`, `providers`, `images`,
 * `video`, `three_d`, `music`, `sound_effects`, `text_to_speech`) default off
 * and are merged in from each registered tenant's handle.
 */
export const DAEMON_DEFAULT_CAPABILITIES: DaemonCapabilities = {
  files: true,
  recent: true,
  workspaces: true,
  secrets: false,
  providers: false,
  images: false,
  video: false,
  three_d: false,
  music: false,
  sound_effects: false,
  text_to_speech: false,
};

export type DaemonHandshakeResponse = {
  /** Wire-protocol version. Bumped only on incompatible changes. */
  protocol: number;
  /** Feature tags the daemon currently serves (e.g. `files@1`). */
  supports: string[];
  /** Daemon route capabilities. Host/native bridge caps are separate. */
  capabilities: DaemonCapabilities;
};
