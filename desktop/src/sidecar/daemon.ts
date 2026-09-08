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
    media_root: string;
    projects_root?: string;
    editor_base_url: string;
    provider_http: ProviderHttpTransport;
    agent:
      | false
      | {
          scratch_base: string;
          skills_root?: string;
          sandbox_enforced: boolean;
          shell_executor?: ShellExecutor;
        };
  };

  export async function create(opts: Options): Promise<DaemonServer> {
    const shared: MediaDaemonOptions = {
      password: opts.password,
      user_data_path: opts.user_data_path,
      provider_home: opts.provider_home,
      media_root: opts.media_root,
      projects_root: opts.projects_root,
      http_access: {
        allowed_origins: [new URL(opts.editor_base_url).origin],
        allowed_referer_paths: ["/desktop"],
      },
      gg_base_url: opts.editor_base_url,
      provider_http: opts.provider_http,
    };
    if (opts.agent === false) {
      const { createMediaDaemon } = await import("@grida/agent/media-server");
      return createMediaDaemon(shared);
    }

    const { createAgentDaemon } = await import("@grida/agent/server");
    return createAgentDaemon({
      ...shared,
      scratch_base: opts.agent.scratch_base,
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
