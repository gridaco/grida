/**
 * `@grida/agent/sandbox` — the composed agent-daemon sandbox policy.
 *
 * Its own subpath (not bundled into `./server`) so a host can compute its
 * OS-sandbox wrap without importing the whole server entry. The host
 * adapts this intent to its sandbox runtime (macOS Seatbelt, etc.); see
 * docs/sandbox-policy.md.
 *
 * The frame (secret-path denies, dev-network baseline) is
 * `@grida/daemon/sandbox`; this module adds the AI upstream hosts only
 * the agent tenant knows (BYOK providers, external-agent vendors).
 */

export { hostFromUrl } from "@grida/daemon/sandbox";
export {
  buildAgentDaemonSandboxPolicy,
  type AgentDaemonSandboxPolicy,
} from "./policy";
