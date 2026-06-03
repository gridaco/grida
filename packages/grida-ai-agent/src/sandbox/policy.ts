/**
 * GRIDA-SEC-004 — AgentHost outer sandbox policy intent.
 *
 * The package owns the capability intent: which upstream hosts the
 * agent host may reach, which high-value secret paths are denied, and
 * the broad read/write shape used by the OS sandbox. Host adapters own
 * concrete sandbox initialization, wrapping, process spawning, and host
 * facts such as `userData` and `home`.
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
  "ai-gateway": ["ai-gateway.vercel.sh", "*.vercel-ai.com"],
} as const satisfies Record<ByokProviderId, readonly string[]>;

const ALWAYS_ALLOWED_HOSTS: readonly string[] = Object.values(
  BYOK_PROVIDER_NETWORK_HOSTS
).flat();

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
