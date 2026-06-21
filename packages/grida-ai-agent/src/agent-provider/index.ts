/**
 * `@grida/agent` agent-provider class (issue #813) — Grida as ACP consumer.
 * Single provider: Claude via `@agentclientprotocol/claude-agent-acp`.
 */
import { openClaudeSession, type BridgeConnect } from "./claude";
import type {
  AgentProviderId,
  AgentProviderSession,
  OpenProviderOptions,
} from "./types";

export * from "./types";
export { openClaudeSession } from "./claude";
export type { BridgeConnect, BridgeTransport } from "./claude";

export function openProvider(
  id: AgentProviderId,
  opts?: OpenProviderOptions,
  deps?: { connect?: BridgeConnect }
): Promise<AgentProviderSession> {
  switch (id) {
    case "claude":
      return openClaudeSession(opts, deps);
    default:
      throw new Error(`unknown agent provider: ${String(id)}`);
  }
}
