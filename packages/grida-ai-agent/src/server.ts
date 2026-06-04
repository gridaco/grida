export {
  AGENT_SERVER_DEFAULT_CAPABILITIES,
  AGENT_SERVER_PROTOCOL,
  type AgentServerCapabilities,
} from "./protocol/handshake";
export type { AgentServerHttpAccess } from "./http/origin";
export {
  AgentHost,
  type AgentHostHttpAccess,
  type AgentHostOptions,
} from "./agent-host";
// Sandbox policy is no longer re-exported here — it moved to its own
// `@grida/agent/sandbox` subpath (see src/sandbox/index.ts) so hosts can
// compute their OS-sandbox wrap without pulling the whole server entry.
