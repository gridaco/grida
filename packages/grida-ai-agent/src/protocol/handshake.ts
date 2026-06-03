/**
 * Handshake protocol — capability negotiation a client performs against
 * an agent server. Client-safe: capability flags + the response shape,
 * no server internals.
 */

export type AgentServerCapabilities = {
  files: boolean;
  recent: boolean;
  secrets: boolean;
  agent: boolean;
  workspaces: boolean;
  sessions: boolean;
  /** Reserved for future `/shell/*` route group; always `false` in V1. */
  shell: boolean;
};

export const AGENT_SERVER_PROTOCOL = 1 as const;

export const AGENT_SERVER_DEFAULT_CAPABILITIES: AgentServerCapabilities = {
  files: true,
  recent: true,
  secrets: true,
  agent: true,
  workspaces: true,
  sessions: true,
  shell: false,
};

export type AgentServerHandshakeResponse = {
  /** Wire-protocol version. Bumped only on incompatible changes. */
  protocol: number;
  /** Feature tags the agent server currently serves (e.g. `files@1`). */
  supports: string[];
  /** Agent-server route capabilities. Host/native bridge caps are separate. */
  capabilities: AgentServerCapabilities;
};
