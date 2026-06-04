import type { Hono } from "hono";
import type {
  AgentServerCapabilities,
  AgentServerHandshakeResponse,
} from "../../protocol/handshake";

/**
 * Agent server route capability flags: which HTTP route groups the
 * host mounts. Sent from agent server to client via the handshake
 * response. The client uses this to gate UI on routes that may be
 * absent in a stripped build.
 *
 * Distinct from any host bridge surface: native namespaces such as
 * `window`, `dialog`, and platform `shell` helpers have no agent-server
 * route equivalent.
 */
export type { AgentServerCapabilities };
export type HandshakeResponse = AgentServerHandshakeResponse;

/**
 * Lookup-table form of the `supports` strings; each entry pairs a
 * capability flag with the feature tag the agent server advertises
 * when that flag is true. Adding a new `@2` upgrade is one entry, not
 * one new `if` arm.
 */
const SUPPORTS_TAGS: Record<keyof AgentServerCapabilities, string> = {
  files: "files@1",
  recent: "recent@1",
  secrets: "secrets@1",
  agent: "agent@1",
  workspaces: "workspaces@1",
  sessions: "sessions@1",
  shell: "shell@1",
};

export function registerHandshakeRoute(
  app: Hono,
  {
    protocol,
    capabilities,
  }: { protocol: number; capabilities: AgentServerCapabilities }
) {
  const supports = (
    Object.entries(SUPPORTS_TAGS) as [keyof AgentServerCapabilities, string][]
  )
    .filter(([k]) => capabilities[k])
    .map(([, v]) => v);

  const response: HandshakeResponse = { protocol, supports, capabilities };

  // `POST` (not `GET`) so it's never confused with a navigation by
  // browser address bars / link previewers / accidental clicks.
  app.post("/handshake", (c) => c.json(response));
}
