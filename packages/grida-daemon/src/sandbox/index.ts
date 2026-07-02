/**
 * `@grida/daemon/sandbox` — package-owned sandbox policy intent.
 *
 * Its own subpath (not bundled into `./server`) so a host can compute its
 * OS-sandbox wrap without importing the whole DaemonServer server entry.
 * The host adapts this intent to its sandbox runtime (macOS Seatbelt,
 * etc.).
 *
 * The daemon frame knows no AI vendor: tenant upstream hosts (BYOK
 * providers, external-agent vendors) are injected via
 * `allowed_network_hosts` — `@grida/agent/sandbox` is the composing
 * counterpart hosts of the agent-daemon actually import.
 */

export {
  buildDaemonSandboxPolicy,
  hostFromUrl,
  type DaemonSandboxPolicy,
} from "./policy";
