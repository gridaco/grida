/**
 * GRIDA-SEC-004 — Desktop's fail-closed outer-sandbox authority intent.
 */
import { buildAgentDaemonSandboxPolicy } from "@grida/agent/sandbox";

/** Desktop's complete package-level intent for the outer agent sandbox. */
export namespace DesktopAgentSandboxPolicy {
  export function build(input: {
    userData: string;
    home: string;
    ggHost: string;
  }) {
    return buildAgentDaemonSandboxPolicy({
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
  }
}
