/**
 * GRIDA-SEC-004 — Desktop's fail-closed outer-sandbox authority intent.
 */
import { buildAgentDaemonSandboxPolicy } from "@grida/agent/sandbox";
import path from "node:path";

/** Desktop's complete package-level intent for the outer agent sandbox. */
export namespace DesktopAgentSandboxPolicy {
  export function build(input: {
    userData: string;
    mediaRoot: string;
    home: string;
    ggHost: string;
  }) {
    const policy = buildAgentDaemonSandboxPolicy({
      user_data: input.userData,
      home: input.home,
      gg_host: input.ggHost,
      // Main owns the listener and transfers only already-accepted loopback
      // sockets. The sandboxed sidecar needs no bind or generic local-connect
      // authority.
      allow_local_binding: false,
      // Provider/GG requests use Electron's system-network session. Keeping
      // their hosts out of SRT makes a missed injection fail closed.
      host_routed_provider_http: true,
      // Raw shell and external children receive no ambient destination.
      direct_network_access: "none",
    });
    const mediaRoot = path.resolve(input.mediaRoot);
    return {
      ...policy,
      filesystem: {
        ...policy.filesystem,
        // The long-lived sidecar owns durable media writes. The root remains
        // outside the agent secret directory and is denied again in every
        // finite-command profile by AgentCommandHost.
        allow_read: uniquePaths([
          ...(policy.filesystem.allow_read ?? []),
          mediaRoot,
        ]),
        allow_write: uniquePaths([...policy.filesystem.allow_write, mediaRoot]),
      },
    };
  }

  function uniquePaths(values: readonly string[]): string[] {
    return [...new Set(values.map((value) => path.resolve(value)))];
  }
}
