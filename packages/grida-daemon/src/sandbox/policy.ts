/**
 * GRIDA-SEC-004 — daemon outer sandbox policy intent.
 *
 * The package owns the capability intent: which high-value secret paths
 * are denied, the broad read/write shape used by the OS sandbox, and the
 * baseline dev-network allowlist the shell workload needs. Host adapters
 * own concrete sandbox initialization, wrapping, process spawning, and
 * host facts such as `userData` and `home`. TENANTS contribute their own
 * upstream hosts via `allowed_network_hosts` — e.g. `@grida/agent/sandbox`
 * composes the BYOK provider + external-agent vendor hosts on top of this
 * frame. The daemon itself knows no AI vendor.
 *
 * Secret-read ownership split (the srt policy here confines the WHOLE
 * sidecar, host process included):
 *
 *   - HOME secrets (`~/.ssh`, `~/.aws`, shell rc files, …) are denied for
 *     the entire tree via `deny_read` below — the host has no business
 *     reading them, so a kernel-level deny is safe.
 *   - The daemon's OWN secret dir (`userData`, where BYOK `auth.json`,
 *     `workspaces.json`, `recent.json`, and the sessions db live) is NOT in
 *     `deny_read`: the daemon process itself must read `auth.json` for
 *     provider calls, and it must read/write the rest. Denying it here would
 *     break host auth. Instead, the shell CHILD is kept out of it IN-PROCESS
 *     by the runner's per-arg check (see `shell/runner.ts`, gate 3), which
 *     rejects any command arg that resolves inside that root.
 */
import path from "node:path";

export type DaemonSandboxPolicy = {
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

/**
 * Broad dev-network allowlist (RFC `permission modes` / network).
 *
 * srt's network model is allow-only and deliberately FORBIDS `*` / overly-broad
 * patterns ("not allowed for security reasons"), so "open network" is
 * enumerated, not unrestricted — srt's structural sandbox is also its network
 * sandbox and cannot be told "allow everything." This is a denylist's mirror: a
 * maintained allowlist of the package/registry + VCS hosts the shell workload
 * needs for real work (install deps, fetch code, clone). It is intentionally a
 * starter set across the major ecosystems and is meant to grow; a host not
 * listed here is unreachable (the workload surfaces a network failure, not a
 * silent hang).
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

export function buildDaemonSandboxPolicy(opts: {
  user_data: string;
  home: string;
  /**
   * Permit the sandboxed process to bind a local socket.
   *
   * Defaults to `true` for backward compatibility. Set to `false` when the
   * host provides a listener-independent request transport and the sandboxed
   * process must have no socket-listen authority.
   */
  allow_local_binding?: boolean;
  /**
   * Include the daemon-owned development-network baseline.
   *
   * Defaults to `true` for backward compatibility. Set to `false` when the
   * host must construct a tenant-only network policy; tenant-contributed
   * `allowed_network_hosts` are still accepted and preserved.
   */
  include_dev_network_hosts?: boolean;
  /**
   * Tenant-contributed upstream hosts (e.g. the agent tenant's BYOK
   * provider + external-agent vendor endpoints), merged with the baseline
   * dev-network allowlist when that baseline is enabled. srt `*.host`
   * matches subdomains only — callers must list apexes explicitly.
   */
  allowed_network_hosts?: readonly string[];
}): DaemonSandboxPolicy {
  const baseline =
    opts.include_dev_network_hosts === false ? [] : DEV_NETWORK_HOSTS;
  const allowedDomains = Array.from(
    new Set([...baseline, ...(opts.allowed_network_hosts ?? [])])
  );
  return {
    network: {
      allowed_domains: allowedDomains,
      denied_domains: [],
      allow_local_binding: opts.allow_local_binding ?? true,
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
