/**
 * GRIDA-SEC-004 — AgentHost outer sandbox policy intent.
 *
 * The package owns the capability intent: which upstream hosts the
 * agent host may reach, which high-value secret paths are denied, and
 * the broad read/write shape used by the OS sandbox. Host adapters own
 * concrete sandbox initialization, wrapping, process spawning, and host
 * facts such as `userData` and `home`.
 *
 * Secret-read ownership split (the srt policy here confines the WHOLE
 * sidecar, host process included):
 *
 *   - HOME secrets (`~/.ssh`, `~/.aws`, shell rc files, …) are denied for
 *     the entire tree via `deny_read` below — the host has no business
 *     reading them, so a kernel-level deny is safe.
 *   - The agent host's OWN secret dir (`userData`, where BYOK `auth.json`,
 *     `workspaces.json`, `recent.json`, and the sessions db live) is NOT in
 *     `deny_read`: the host process itself must read `auth.json` for
 *     provider calls, and it must read/write the rest. Denying it here would
 *     break host auth. Instead, the shell CHILD is kept out of it IN-PROCESS
 *     by the runner's per-arg check (see `shell/runner.ts`, gate 3), which
 *     rejects any command arg that resolves inside that root.
 */
import path from "node:path";
import type { ByokProviderId } from "../protocol/provider-ids";

export type AgentHostSandboxPolicy = {
  network: {
    allowed_domains: string[];
    denied_domains: string[];
    allow_local_binding: boolean;
  };
  filesystem: {
    deny_read: string[];
    allow_read?: string[];
    allow_write: string[];
    deny_write: string[];
  };
};

const BYOK_PROVIDER_NETWORK_HOSTS = {
  openrouter: ["openrouter.ai"],
  vercel: ["ai-gateway.vercel.sh", "*.vercel-ai.com"],
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

/**
 * Broad dev-network allowlist (RFC `permission modes` / network).
 *
 * srt's network model is allow-only and deliberately FORBIDS `*` / overly-broad
 * patterns ("not allowed for security reasons"), so "open network" is
 * enumerated, not unrestricted — srt's structural sandbox is also its network
 * sandbox and cannot be told "allow everything." This is a denylist's mirror: a
 * maintained allowlist of the package/registry + VCS hosts the agent needs for
 * real work (install deps, fetch code, clone). It is intentionally a starter
 * set across the major ecosystems and is meant to grow; a host not listed here
 * is unreachable (the agent surfaces a network failure, not a silent hang).
 *
 * Apex AND `*.` are both listed where needed: srt's `*.host` matches
 * subdomains only, not the bare apex.
 */
const DEV_NETWORK_HOSTS: readonly string[] = [
  // npm / Node / Yarn
  "registry.npmjs.org",
  "*.npmjs.org",
  "registry.yarnpkg.com",
  // PyPI / Python
  "pypi.org",
  "files.pythonhosted.org",
  "*.pythonhosted.org",
  // crates / Rust
  "crates.io",
  "static.crates.io",
  "index.crates.io",
  // Go modules
  "proxy.golang.org",
  "sum.golang.org",
  // Deno / JSR
  "deno.land",
  "*.deno.land",
  "jsr.io",
  // VCS hosting + raw source
  "github.com",
  "*.github.com",
  "*.githubusercontent.com",
  "gitlab.com",
  "*.gitlab.com",
  "bitbucket.org",
];

const ALWAYS_ALLOWED_HOSTS: readonly string[] = [
  ...Object.values(BYOK_PROVIDER_NETWORK_HOSTS).flat(),
  ...AGENT_PROVIDER_NETWORK_HOSTS,
  ...DEV_NETWORK_HOSTS,
];

function homeProtectedPaths(home: string): string[] {
  return [
    path.join(home, ".ssh"),
    path.join(home, ".aws"),
    path.join(home, ".gnupg"),
    path.join(home, ".docker", "config.json"),
    path.join(home, ".kube"),
    path.join(home, ".config", "gh"),
    path.join(home, ".config", "gcloud"),
    path.join(home, ".netrc"),
    path.join(home, ".npmrc"),
    path.join(home, ".pypirc"),
    path.join(home, ".profile"),
    path.join(home, ".bash_profile"),
    path.join(home, ".bash_login"),
    path.join(home, ".bashrc"),
    path.join(home, ".zprofile"),
    path.join(home, ".zshenv"),
    path.join(home, ".zshrc"),
    path.join(home, ".config", "fish", "config.fish"),
    path.join(home, ".cargo", "credentials"),
    path.join(home, ".cargo", "credentials.toml"),
  ];
}

function writeAllowlist(home: string, userData: string): string[] {
  return [userData, home, "/tmp", "/var/folders"];
}

export function buildAgentHostSandboxPolicy(opts: {
  user_data: string;
  home: string;
}): AgentHostSandboxPolicy {
  const allowedDomains = Array.from(new Set(ALWAYS_ALLOWED_HOSTS));
  return {
    network: {
      allowed_domains: allowedDomains,
      denied_domains: [],
      allow_local_binding: true,
    },
    filesystem: {
      deny_read: homeProtectedPaths(opts.home),
      allow_read: undefined,
      allow_write: writeAllowlist(opts.home, opts.user_data),
      deny_write: homeProtectedPaths(opts.home),
    },
  };
}

export function hostFromUrl(url: string): string {
  return new URL(url).hostname;
}
