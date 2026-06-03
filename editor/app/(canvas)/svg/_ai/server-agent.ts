/**
 * Thin shim around `@grida/agent` that injects this app's
 * model factory. The agent definition (system prompt, tools, loop
 * shape, tier handling) lives in the package and is shared with the
 * Grida Desktop AgentSidecar (BYOK path) — see GRIDA-SEC-004.
 */
import { createAgent } from "@grida/agent";
import { model } from "@/lib/ai/server";

export {
  AGENT_DEFAULT_TIER,
  AGENT_TIERS,
  type ModelTier,
  type AgentCallOptions,
  type AgentMessage,
} from "@grida/agent";

// Web SVG demo: Grida Copilot constrained to the single SVG document the
// editor has mounted. The constraint is structural — the renderer-side
// `AgentFs` only mounts `/<id>.svg`, so `list_files` and friends see one
// file. No shell capability — the web has no shell to give.
export const gridaAgent = createAgent({
  model_factory: model,
  skills: ["svg"],
});
