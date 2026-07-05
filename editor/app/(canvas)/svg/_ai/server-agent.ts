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

// The svg skill, eagerly inlined for the web SVG editor. This host has no
// workspace and no bundled skills dir, so it can't advertise-then-load like the
// desktop/CLI agent (which discovers the same skill from the repo-root `skills/`
// tree). svg is unconditionally relevant on this surface, so a single eager
// block is the right call. Kept in sync with `skills/svg/SKILL.md`.
const SVG_SKILL_BLOCK = `<skill name="svg">
When you operate on \`.svg\` files inside a Grida editor session:

- Writes are reflected on the canvas instantly if the human is currently
  viewing that document. Treat the canvas as a live render of what you wrote.
- On \`edit_file\` reason="parse_error", your output broke the SVG. Re-read and fix.

When you produce SVG:
- Keep \`xmlns="http://www.w3.org/2000/svg"\` on the root element.
- Preserve existing \`viewBox\`, \`width\`, \`height\` unless asked.
- Preserve unrelated nodes and attributes (ids, classes, transforms).
- Match the existing formatting (one element per line, 2-space indent).
</skill>`;

// Web SVG demo: Grida Copilot constrained to the single SVG document the
// editor has mounted. The constraint is structural — the renderer-side
// `AgentFs` only mounts `/<id>.svg`, so `list_files` and friends see one
// file. No shell capability — the web has no shell to give.
export const gridaAgent = createAgent({
  model_factory: model,
  skill_blocks: [SVG_SKILL_BLOCK],
});
