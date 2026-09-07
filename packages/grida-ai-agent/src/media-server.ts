// GRIDA-SEC-004 — media startup behind the existing daemon perimeter.
// GRIDA-SEC-006 / GRIDA-GG: provider — per-launch shared GG custody, cleared at stop.
/**
 * Media-only host composition. This entry does not import the chat runtime,
 * sessions database, scratch/skills discovery, native ChatGPT provider or ACP.
 * It uses the existing HTTP adapters and daemon-owned credential/media stores.
 */
import {
  DaemonServer,
  type DaemonCapabilities,
  type DaemonHttpAccess,
  type DaemonTenant,
} from "@grida/daemon/server";
import type { ProviderHttpTransport } from "@grida/ai";
import { MediaHost } from "./media-host";
export type { ProviderHttpTransport };

export type MediaCapabilities = Pick<
  DaemonCapabilities,
  | "secrets"
  | "images"
  | "video"
  | "three_d"
  | "music"
  | "sound_effects"
  | "text_to_speech"
>;

export type MediaTenantOptions = {
  /** Existing media groups and BYOK settings. All default on. */
  capabilities?: Partial<MediaCapabilities>;
  /**
   * The host authorizes concrete provider requests and credential-free asset
   * downloads. Both lanes are required together; omitted request transport
   * preserves standalone ambient fetch, while remote downloads fail closed.
   */
  provider_http?: ProviderHttpTransport;
  /** Enables the existing GG session routes and hosted media; omitted means dormant. */
  gg_base_url?: string;
};

/** Mount only media, BYOK settings and optional GG routes; no SSE token exceptions. */
export function createMediaTenant(opts: MediaTenantOptions = {}): DaemonTenant {
  return {
    register: (app, services) => {
      const media = new MediaHost(services, opts);
      media.register(app);
      media.start();
      return {
        capabilities: media.capabilities,
        cleanup: () => media.dispose(),
      };
    },
  };
}

export type MediaDaemonOptions = Omit<MediaTenantOptions, "capabilities"> & {
  password: string;
  user_data_path: string;
  projects_root?: string;
  media_root?: string;
  http_access: DaemonHttpAccess;
  hostname?: string;
  port?: number;
  /**
   * Daemon file/workspace groups and media default on. Chat, sessions, endpoint
   * providers and shell stay off; enabling them requires the full agent entry.
   */
  capabilities?: Partial<
    MediaCapabilities &
      Pick<DaemonCapabilities, "files" | "recent" | "workspaces">
  >;
};

/** One daemon frame and one media tenant; the frame owns start/fetch/stop lifecycle. */
export function createMediaDaemon(opts: MediaDaemonOptions): DaemonServer {
  return new DaemonServer({
    password: opts.password,
    user_data_path: opts.user_data_path,
    projects_root: opts.projects_root,
    media_root: opts.media_root,
    http_access: opts.http_access,
    hostname: opts.hostname,
    port: opts.port,
    capabilities: {
      files: opts.capabilities?.files ?? true,
      recent: opts.capabilities?.recent ?? true,
      workspaces: opts.capabilities?.workspaces ?? true,
    },
    tenants: [
      createMediaTenant({
        capabilities: opts.capabilities,
        provider_http: opts.provider_http,
        gg_base_url: opts.gg_base_url,
      }),
    ],
  });
}
