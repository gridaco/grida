/**
 * GRIDA-SEC-014 — native protected roots and shared provider custody.
 *
 * `@grida/daemon/server` — the GRIDA-SEC-004 Node surface for hosts and
 * tenants.
 *
 * Two audiences, one entry:
 *   - HOSTS (the desktop sidecar) construct `DaemonServer` (usually via a
 *     composed factory like `@grida/ai-host/media-server`'s
 *     `createMediaDaemon`) and drive `start()` / `stop()`. A host-owned
 *     transport can select `start({ listen: false })` and deliver standard
 *     Requests through `DaemonServer.fetch` without binding a socket.
 *   - TENANTS (the media tenant in `@grida/ai-host`) implement `DaemonTenant`
 *     against `DaemonServices` and use the toolkit below (stores, request
 *     validation) — the daemon depends on nothing tenant-specific; tenants
 *     depend on this package.
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
// Sandbox policy is not re-exported here — it lives on its own
// `@grida/daemon/sandbox` subpath (see src/sandbox/index.ts) so hosts can
// compute their OS-sandbox wrap without pulling the whole server entry.

// ── Tenant toolkit ──────────────────────────────────────────────────
// The daemon-owned primitives a tenant builds on. Kept explicit (no
// star) so the seam surface stays reviewable.
export { ProtectedRoots } from "./protected-roots";
export { WorkspaceRegistry, type Workspace } from "./workspaces";
export { WorkspaceCatalogReader } from "./workspaces/catalog-reader";
export type { WorkspaceDirectoryIdentity } from "./workspaces/directory-identity";
export { workspaceFs } from "./workspaces/fs";
export { MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES } from "./http/routes/workspaces";
export {
  workspaceFileResponse,
  type WorkspaceFileBody,
} from "./http/workspace-file-response";
export { FileRegistry } from "./files/registry";
export { RecentStore } from "./files/recent";
export { MediaStore, type MediaPersistence } from "./media";
export { SecretsStore } from "./secrets";
export {
  AuthStore,
  AuthPermissionsError,
  type ApiKeyEntry,
  type AuthFile,
  type AuthInfo,
  type OAuthEntry,
} from "./auth/file";
export { containsPath } from "./path-contains";
export { atomicWrite, type AtomicWriteOptions } from "./storage/atomic-write";
export { body, v, type Validator } from "./http/validate";
