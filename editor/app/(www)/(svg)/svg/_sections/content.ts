// Raw code/diff snippets for the /svg marketing page. Kept in a plain module
// so the server page can highlight them with Shiki and pass the HTML down to
// the client section components.

/**
 * A logo.svg round-tripping between an AI agent and a human: only the two
 * intended `fill` lines change, the rest survives verbatim. Rendered with
 * Shiki's `diff` grammar.
 */
export const AGENTIC_DIFF = `<svg viewBox="0 0 64 64">
  <path d="M12 8h40v..." />
  <circle cx="32" cy="32" r="10"
-   fill="#6366F1" />
+   fill="#10B981" />
  <text x="32" y="58">grida</text>
</svg>`;

/** Headless SDK usage snippet. Rendered with Shiki's TypeScript grammar. */
export const SDK_CODE = `import { createSvgEditor } from "@grida/svg-editor";

const editor = createSvgEditor({
  svg: "<svg ...>...</svg>",
});

// edit by capability, not by tag — clean diff guaranteed
editor.commands.set_paint("fill", {
  kind: "color",
  value: { kind: "rgb", value: "#10B981" },
});

// hand a single subtree to an AI agent
const fragment = editor.serialize_node(selectedId);

// emit clean SVG — round-trip per P1
const out = editor.serialize();`;
