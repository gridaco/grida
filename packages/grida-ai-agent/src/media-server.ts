// GRIDA-SEC-014 — explicit shared provider custody and protected native roots.
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
import { registerProvidersRoutes } from "./http/routes/providers";
import { MediaHost } from "./media-host";
import { EndpointProvidersStore } from "./providers/endpoints";
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
  /** Allow an authorized host to manage saved custom provider endpoints. */
  endpoint_settings?: boolean;
};

/** Mount shared media and optional provider settings without chat state. */
export function createMediaTenant(opts: MediaTenantOptions = {}): DaemonTenant {
  return {
    register: (app, services) => {
      const endpoints = opts.endpoint_settings
        ? new EndpointProvidersStore(services.user_data_path)
        : undefined;
      const media = new MediaHost(services, opts, { endpoints });
      media.register(app);
      if (endpoints) {
        registerProvidersRoutes(app, {
          endpoints,
          secrets: services.secrets,
          provider_http: media.providerHttp,
        });
      }
      media.start();
      return {
        capabilities: { ...media.capabilities, providers: !!endpoints },
        cleanup: () => media.dispose(),
      };
    },
  };
}

export type MediaDaemonOptions = Omit<MediaTenantOptions, "capabilities"> & {
  password: string;
  user_data_path: string;
  /** Shared native provider home; omission keeps this host's credentials isolated. */
  provider_home?: string;
  projects_root?: string;
  workspace_catalog?: string;
  protected_file_roots?: readonly string[];
  media_root?: string;
  http_access: DaemonHttpAccess;
  hostname?: string;
  port?: number;
  /**
   * Daemon file/workspace groups and media default on. Chat, sessions and shell
   * stay off. Endpoint settings require a separate host opt-in.
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
    provider_home: opts.provider_home,
    projects_root: opts.projects_root,
    workspace_catalog: opts.workspace_catalog,
    protected_file_roots: opts.protected_file_roots,
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
        endpoint_settings: opts.endpoint_settings,
      }),
    ],
  });
}
