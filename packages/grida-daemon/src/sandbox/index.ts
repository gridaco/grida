/**
 * `@grida/daemon/sandbox` — package-owned GRIDA-SEC-004 sandbox policy
 * intent.
 *
 * Its own subpath (not bundled into `./server`) so a host can compute its
 * OS-sandbox wrap without importing the whole DaemonServer server entry.
 * The host adapts this intent to its sandbox runtime (macOS Seatbelt,
 * etc.).
 *
 * The daemon frame knows no AI vendor: tenants inject their upstream hosts
 * through `allowed_network_hosts`. Hosts may set
 * `include_dev_network_hosts: false` when they require a tenant-only network
 * policy; this omits only the daemon-owned development baseline and preserves
 * tenant contributions. A host with a listener-independent request transport
 * may separately set `allow_local_binding: false` so the sandboxed process has
 * no socket-listen authority.
 */

export {
  buildDaemonSandboxPolicy,
  hostFromUrl,
  type DaemonSandboxPolicy,
} from "./policy";
