// GRIDA-SEC-014 — explicit shared provider custody and protected native roots.
// GRIDA-SEC-004 — Desktop selects composition before importing chat machinery.
// GRIDA-SEC-006 / GRIDA-GG: desktop — one scoped GG authority per launch.
import type { DaemonServer, ShellExecutor } from "@grida/daemon/server";
import type {
  MediaDaemonOptions,
  ProviderHttpTransport,
} from "@grida/agent/media-server";
import { CHATGPT_SUBSCRIPTION_CONFIG } from "../chatgpt-configuration";

/** Node host glue only: HTTP adapters and model operations remain package-owned. */
export namespace DesktopDaemon {
  export type Options = {
    password: string;
    user_data_path: string;
    provider_home?: string;
    prepare_provider_custody?: () => Promise<void>;
    media_root: string;
    retained_media_scope?: boolean;
    workspace_catalog?: string;
    protected_file_roots?: readonly string[];
    projects_root?: string;
    editor_base_url: string;
    provider_http: ProviderHttpTransport;
    agent:
      | false
      | "native-chat"
      | {
          scratch_base: string;
          skills_root?: string;
          sandbox_enforced: boolean;
          owned_legacy_writer?: boolean;
          shell_executor?: ShellExecutor;
        };
  };

  export async function create(opts: Options): Promise<DaemonServer> {
    const { agent } = opts;
    const ownedLegacy = typeof agent === "object" && agent.owned_legacy_writer;
    if (ownedLegacy && (!agent.sandbox_enforced || agent.shell_executor)) {
      throw new Error("owned_legacy_writer_scope_invalid");
    }
    if (opts.retained_media_scope && opts.agent !== "native-chat") {
      throw new Error("retained_media_scope_invalid");
    }
    if (
      Boolean(opts.prepare_provider_custody) !==
      Boolean(opts.retained_media_scope)
    ) {
      throw new Error("retained_media_custody_invalid");
    }
    if (
      (opts.workspace_catalog && opts.agent !== "native-chat") ||
      (opts.protected_file_roots &&
        opts.agent !== "native-chat" &&
        !ownedLegacy) ||
      (opts.retained_media_scope &&
        (opts.workspace_catalog || opts.protected_file_roots))
    )
      throw new Error("workspace_catalog_scope_invalid");
    const shared: MediaDaemonOptions = {
      password: opts.password,
      user_data_path: opts.user_data_path,
      provider_home: opts.provider_home,
      prepare_provider_custody: opts.prepare_provider_custody,
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
    if (opts.agent === false || opts.agent === "native-chat") {
      const { createMediaDaemon } = await import("@grida/agent/media-server");
      return createMediaDaemon(
        opts.agent === "native-chat"
          ? {
              ...shared,
              endpoint_settings: true,
              capabilities: {
                recent: false,
                ...(opts.workspace_catalog ? { workspaces: false } : undefined),
                ...(opts.retained_media_scope
                  ? { files: false, workspaces: false }
                  : undefined),
              },
            }
          : shared
      );
    }

    const { createAgentDaemon } = await import("@grida/agent/server");
    return createAgentDaemon({
      ...shared,
      scratch_base: opts.agent.scratch_base,
      ...(ownedLegacy ? { retain_session_scratch: true } : {}),
      skills_root: opts.agent.skills_root,
      sandbox_enforced: opts.agent.sandbox_enforced,
      shell_executor: opts.agent.sandbox_enforced
        ? opts.agent.shell_executor
        : undefined,
      // External ACP has no separately confined host transport in Desktop.
      external_agent_execution: "disabled",
      interactive: true,
      library: true,
      // GRIDA-SEC-008 — native model capacity remains in the full agent host.
      chatgpt: CHATGPT_SUBSCRIPTION_CONFIG,
    });
  }
}
