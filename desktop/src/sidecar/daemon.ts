// GRIDA-SEC-014 — explicit shared provider custody and protected native roots.
// GRIDA-SEC-004 — Desktop selects composition before importing chat machinery.
// GRIDA-SEC-006 / GRIDA-GG: desktop — one scoped GG authority per launch.
// GRIDA-SEC-008 — retained services construct no subscription provider.
import type { DaemonServer } from "@grida/daemon/server";
import type {
  MediaDaemonOptions,
  ProviderHttpTransport,
} from "@grida/ai-host/media-server";

/** Node host glue only: HTTP adapters and model operations remain package-owned. */
export namespace DesktopDaemon {
  export type Options = {
    password: string;
    user_data_path: string;
    provider_home?: string;
    media_root: string;
    ordinary_native_chat_services?: boolean;
    workspace_catalog?: string;
    protected_file_roots?: readonly string[];
    projects_root?: string;
    editor_base_url: string;
    provider_http: ProviderHttpTransport;
    agent: false | "native-chat";
  };

  export async function create(opts: Options): Promise<DaemonServer> {
    const { agent } = opts;
    if (
      typeof opts.provider_http?.request !== "function" ||
      typeof opts.provider_http?.download !== "function"
    ) {
      throw new Error("desktop_provider_transport_required");
    }
    if (
      opts.ordinary_native_chat_services &&
      (agent !== "native-chat" || opts.workspace_catalog)
    )
      throw new Error("ordinary_native_chat_services_invalid");
    if (opts.workspace_catalog && opts.agent !== "native-chat")
      throw new Error("workspace_catalog_scope_invalid");
    const shared: MediaDaemonOptions = {
      password: opts.password,
      user_data_path: opts.user_data_path,
      provider_home: opts.provider_home,
      media_root: opts.media_root,
      projects_root: opts.projects_root,
      workspace_catalog: opts.workspace_catalog,
      protected_file_roots: opts.protected_file_roots,
      http_access: {
        allowed_origins: [new URL(opts.editor_base_url).origin],
        allowed_referer_paths: ["/desktop"],
      },
      gg_base_url: opts.editor_base_url,
      provider_http: opts.provider_http,
    };
    const { createMediaDaemon } = await import("@grida/ai-host/media-server");
    return createMediaDaemon(
      opts.agent === "native-chat"
        ? {
            ...shared,
            endpoint_settings: true,
            capabilities: {
              recent: opts.ordinary_native_chat_services === true,
              ...(opts.workspace_catalog ? { workspaces: false } : undefined),
            },
          }
        : shared
    );
  }
}
