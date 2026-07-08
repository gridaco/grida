/**
 * `@grida/daemon/server` — the Node surface for hosts and tenants.
 *
 * Two audiences, one entry:
 *   - HOSTS (desktop sidecar, CLI) construct `DaemonServer` (usually via a
 *     composed factory like `@grida/agent/server`'s `createAgentDaemon`)
 *     and drive `start()` / `stop()`.
 *   - TENANTS (`@grida/agent`) implement `DaemonTenant` against
 *     `DaemonServices` and use the toolkit below (stores, shell runner,
 *     request validation) — the daemon depends on nothing tenant-specific;
 *     tenants depend on this package (issue #927).
 */

export {
  DAEMON_DEFAULT_CAPABILITIES,
  DAEMON_PROTOCOL,
  type DaemonCapabilities,
  type DaemonHandshakeResponse,
} from "./protocol/handshake";
export type { DaemonHttpAccess } from "./http/origin";
export { DaemonServer, type DaemonServerOptions } from "./daemon-server";
export {
  buildServer,
  type BuiltServer,
  type DaemonServices,
  type DaemonTenant,
  type DaemonTenantHandle,
  type ServerOptions,
} from "./http/server";
// Daemon discovery contract (WG spec docs/wg/ai/agent/daemon.md, #798):
// registration record + persistent credential + authenticated probe +
// connect-or-spawn. Node-only (fs), so it ships from the server entry.
export { Daemon } from "./daemon";
// Sandbox policy is not re-exported here — it lives on its own
// `@grida/daemon/sandbox` subpath (see src/sandbox/index.ts) so hosts can
// compute their OS-sandbox wrap without pulling the whole server entry.

// ── Tenant toolkit ──────────────────────────────────────────────────
// The daemon-owned primitives a tenant builds on. Kept explicit (no
// star) so the seam surface stays reviewable.
export { WorkspaceRegistry, type Workspace } from "./workspaces";
export { workspaceFs } from "./workspaces/fs";
export {
  SCAN_MAX_DEPTH,
  SCAN_MAX_FILES,
  isIgnoredScanDir,
  isIgnoredScanFile,
} from "./workspaces/scan";
export { FileRegistry } from "./files/registry";
export { RecentStore } from "./files/recent";
export { SecretsStore } from "./secrets";
export {
  AuthStore,
  AuthPermissionsError,
  type ApiKeyEntry,
  type AuthFile,
  type AuthInfo,
  type OAuthEntry,
} from "./auth/file";
export {
  runShell,
  validateShellRequest,
  type AdditionalAllowedRoots,
  type ProtectedReadRoots,
  type ShellRunError,
  type ShellRunRequest,
  type ShellRunResult,
} from "./shell/runner";
export { containsPath } from "./path-contains";
export { isReadOnlyCommand } from "./permissions";
export { atomicWrite, type AtomicWriteOptions } from "./storage/atomic-write";
export { body, v, type Validator } from "./http/validate";
