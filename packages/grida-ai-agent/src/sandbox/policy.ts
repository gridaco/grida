// GRIDA-GG: provider — allow sandbox egress to the GG host (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004 — the agent-daemon's outer sandbox policy.
 *
 * `@grida/daemon/sandbox` owns the frame: secret-path denies, the broad
 * read/write shape, and the baseline dev-network allowlist. This module
 * contributes what only the agent tenant knows — the AI upstream hosts —
 * and composes the policy hosts actually wrap the sidecar with.
 */
import {
  buildDaemonSandboxPolicy,
  type DaemonSandboxPolicy,
} from "@grida/daemon/sandbox";
import type { ByokProviderId } from "../protocol/provider-ids";

export type AgentDaemonSandboxPolicy = DaemonSandboxPolicy;

const BYOK_PROVIDER_NETWORK_HOSTS = {
  openrouter: ["openrouter.ai"],
  vercel: ["ai-gateway.vercel.sh", "*.vercel-ai.com"],
  // fal (#908) — BYOK image provider. Submit/poll/result ride the queue API
  // (`queue.fal.run`); generated images download from the fal media CDN
  // (`fal.media`, incl. `v3.fal.media`). srt `*.host` matches subdomains only,
  // so the apexes are listed too. Same posture as the other BYOK hosts: the
  // provider sees the prompt by design — not a new exfil class.
  fal: ["fal.run", "*.fal.run", "fal.media", "*.fal.media"],
} as const satisfies Record<ByokProviderId, readonly string[]>;

/**
 * Agent-provider class (issue #813) — the EXTERNAL agent's OWN vendor backend.
 *
 * When the host drives an external agent (Claude Code) that owns its loop, that
 * agent makes its own outbound calls (auth + inference) to its vendor. Those
 * hosts aren't in the BYOK set, so srt's allow-only network sandbox 403s them
 * ("blocked by network allowlist") and the agent reports "Failed to
 * authenticate". The agent still runs tools/shell in the workspace and could be
 * prompt-injected, so we KEEP it confined and only add its legitimate vendor
 * endpoints — same posture as a BYOK provider host (the provider sees the
 * conversation by design; this is not a new exfil class).
 *
 * Grounded against `@anthropic-ai/claude-agent-sdk`: auth + inference ride
 * `api.anthropic.com` (incl. `/api/oauth/claude_cli/*`); the engine also
 * references `claude.ai` and `*.anthropic.com` (docs / statsig / mcp-proxy).
 * srt's `*.host` matches subdomains only, so the apexes are listed too.
 * Codex / claude-acp hosts get added here when those providers are surfaced.
 */
const AGENT_PROVIDER_NETWORK_HOSTS: readonly string[] = [
  "api.anthropic.com",
  "anthropic.com",
  "*.anthropic.com",
  "claude.ai",
  "*.claude.ai",
];

/** Every AI upstream the agent tenant may legitimately reach. */
const AGENT_NETWORK_HOSTS: readonly string[] = [
  ...Object.values(BYOK_PROVIDER_NETWORK_HOSTS).flat(),
  ...AGENT_PROVIDER_NETWORK_HOSTS,
];

export function buildAgentDaemonSandboxPolicy(opts: {
  user_data: string;
  home: string;
  /**
   * Whether the sandboxed process may bind a local socket. Forwarded to the
   * daemon-owned policy frame. Defaults to `true` for CLI/standalone
   * compatibility; set `false` when the host supplies a listener-independent
   * request transport and the process must have no socket-listen authority.
   */
  allow_local_binding?: boolean;
  /**
   * Direct outbound-network posture for the sandboxed process tree.
   *
   * `"allowlisted"` (default) preserves the existing composed allowlist:
   * daemon development hosts plus the agent hosts selected below.
   * `"none"` contributes no provider, GG, or ACP-vendor hosts and also asks
   * the daemon frame to omit its development baseline. The resulting
   * `allowed_domains` is empty, so raw shell and external-agent children have
   * no direct outbound destination. Local-listening authority is orthogonal
   * and controlled by {@link allow_local_binding}.
   */
  direct_network_access?: "allowlisted" | "none";
  /**
   * Provider HTTP leaves the sandbox through a host-owned transport. When
   * true, remove every direct in-process BYOK/GG destination from the outer
   * process allowlist so a missed provider call fails closed instead of
   * bypassing that transport. The daemon's baseline development hosts and the
   * external-agent vendor hosts remain: ACP subprocesses own their network
   * stack and are confined by this same outer sandbox.
   *
   * Default false preserves the CLI/standalone ambient-fetch behavior.
   */
  host_routed_provider_http?: boolean;
  /**
   * GRIDA-SEC-006 — host serving the Grida hosted-AI endpoints (e.g.
   * `grida.co`, or `localhost` in dev). Without it a packaged
   * (srt-wrapped) daemon's `grida` provider calls are 403'd by the
   * egress allowlist. The apex AND its subdomains are allowed (srt
   * `*.host` matches subdomains only, so both are listed).
   */
  gg_host?: string;
}): AgentDaemonSandboxPolicy {
  const directNetworkAccess = opts.direct_network_access ?? "allowlisted";
  const hosts =
    directNetworkAccess === "none"
      ? []
      : opts.host_routed_provider_http
        ? [...AGENT_PROVIDER_NETWORK_HOSTS]
        : [...AGENT_NETWORK_HOSTS];
  if (
    directNetworkAccess === "allowlisted" &&
    opts.gg_host &&
    !opts.host_routed_provider_http
  ) {
    hosts.push(opts.gg_host, `*.${opts.gg_host}`);
  }
  return buildDaemonSandboxPolicy({
    user_data: opts.user_data,
    home: opts.home,
    allow_local_binding: opts.allow_local_binding,
    include_dev_network_hosts: directNetworkAccess === "allowlisted",
    allowed_network_hosts: hosts,
  });
}
