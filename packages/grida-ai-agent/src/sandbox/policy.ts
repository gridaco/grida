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
}): AgentDaemonSandboxPolicy {
  return buildDaemonSandboxPolicy({
    ...opts,
    allowed_network_hosts: AGENT_NETWORK_HOSTS,
  });
}
