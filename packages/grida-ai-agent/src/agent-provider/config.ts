/**
 * Agent-provider configuration — the SINGLE place to see and change how Grida
 * drives the external Claude agent over ACP (issue #813): the system prompt,
 * the tools it can call (MCP), reasoning visibility, and what filesystem /
 * terminal access we mediate. `claude.ts` is plumbing that reads from here;
 * this is the dial board.
 *
 * Per-session values (the picked `model`, a resume id) are NOT here — they vary
 * per turn and are threaded through `OpenProviderOptions`.
 */
import type { ClientCapabilities, McpServer } from "@agentclientprotocol/sdk";
import { prompts } from "../prompts";

/** The npx bridge (ACP adapter wrapping the Claude Agent SDK) we spawn. */
export const BRIDGE_PACKAGE = "@agentclientprotocol/claude-agent-acp";

/**
 * Static ACP/SDK knobs sent on every `session/new` and `session/resume`. To
 * change what the agent can do, edit HERE:
 *   - give it tools       → add an MCP server to `mcp_servers`
 *   - mediate its fs/term → set flags on `client_capabilities`
 *   - change its prompt   → edit `prompts.acp_system` (central registry `../prompts`)
 *   - reasoning visibility → `thinking`
 */
export const acp_config = {
  /**
   * Capabilities we advertise to the agent. Empty `{}` = the agent uses its own
   * filesystem / terminal directly (no Grida mediation). Set `fs` / `terminal`
   * here to route its file & command access back through us.
   */
  client_capabilities: {} as ClientCapabilities,

  /**
   * MCP servers handed to the agent — its callable tool surface BEYOND the
   * built-ins. Empty `[]` = built-in tools only. Add Grida's tools (e.g. a
   * canvas MCP server) here to make them available to the agent.
   */
  mcp_servers: [] as McpServer[],

  /**
   * Reasoning visibility. Opus 4.7+ defaults `display` to `"omitted"` (thinking
   * streams empty); `"summarized"` restores visible reasoning summaries.
   */
  thinking: { type: "adaptive", display: "summarized" },

  /**
   * System-prompt mode. `{ append }` augments Claude Code's preset with
   * `prompts.acp_system`; the bridge locks `type:"preset", preset:"claude_code"`.
   * (A bare string here would REPLACE the whole prompt — avoid.)
   */
  system_prompt: { append: prompts.acp_system },
};
