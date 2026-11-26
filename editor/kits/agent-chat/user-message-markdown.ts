import { defaultRemarkPlugins } from "streamdown";
import { SkillMentions } from "@/lib/agent-chat/skill-mentions";
import { WorkspaceMention } from "@/kits/composer/workspace-mention";

const SKILL_MARKER_ORIGIN = "https://grida-skill.invalid/";

export function isUserMessageSkillMarker(href: string | undefined): boolean {
  return href?.startsWith(SKILL_MARKER_ORIGIN) ?? false;
}

/** Accept inline positioning only for the display parts bound to this input. */
export function projectUserMessageSkills(
  text: string,
  parts?: readonly unknown[]
) {
  const context = parts ?? [];
  const inline = SkillMentions.inline(text, context);
  const links = new Map<string, { label: string; source?: string }>();
  const hasWorkspaceMentions = WorkspaceMention.inline(text).length > 0;
  if (!inline.length) return { text, context, links, hasWorkspaceMentions };

  let start = 0;
  let markdown = "";
  const positioned = new Set<string>();
  for (const match of inline) {
    const { label, source, uri } = match;
    // The renderer consumes this local marker as a span. Including the source
    // keeps the Markdown view current when the host confirms an optimistic send.
    const href =
      SKILL_MARKER_ORIGIN +
      encodeURIComponent(uri) +
      "#" +
      encodeURIComponent(source ?? "");
    links.set(href, { label: label.slice(1), source });
    positioned.add(uri);
    markdown +=
      text.slice(start, match.from) + SkillMentions.markup(label, href);
    start = match.to;
  }
  return {
    text: markdown + text.slice(start),
    context: context.filter((part) => !positioned.has(skillUri(part) ?? "")),
    links,
    hasWorkspaceMentions,
  };
}

function skillUri(part: unknown): string | undefined {
  if (
    !part ||
    typeof part !== "object" ||
    !("kind" in part) ||
    part.kind !== "skill" ||
    !("version" in part) ||
    part.version !== 1 ||
    !("data" in part) ||
    !part.data ||
    typeof part.data !== "object" ||
    !("uri" in part.data) ||
    typeof part.data.uri !== "string"
  )
    return;
  return part.data.uri;
}

// Match the document formatting supported by ComposerTiptap. Use Streamdown's
// parser to recognize extended syntax as a unit before displaying its source.
const composerSyntax = new Set([
  "paragraph",
  "text",
  "emphasis",
  "strong",
  "inlineCode",
  "code",
  "blockquote",
  "list",
  "listItem",
  "break",
  "link",
]);

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  value?: string;
  lang?: string | null;
  checked?: boolean | null;
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

function literalUnsupportedMarkdown() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    if (typeof file.value !== "string") return;
    const source = file.value;

    function visit(parent: MarkdownNode) {
      const blockContent =
        parent.type === "root" ||
        parent.type === "blockquote" ||
        parent.type === "listItem";

      parent.children = parent.children?.map((node) => {
        const start = node.position?.start.offset;
        if (
          !composerSyntax.has(node.type) ||
          (node.type === "code" && node.lang === "mermaid") ||
          (node.type === "link" &&
            (start === undefined || source[start] !== "[")) ||
          (node.type === "list" &&
            node.children?.some((item) => typeof item.checked === "boolean"))
        ) {
          const end = node.position?.end.offset;
          const value =
            start !== undefined && end !== undefined
              ? source.slice(start, end)
              : (node.value ?? "");
          const text = { type: "text", value };
          return blockContent ? { type: "paragraph", children: [text] } : text;
        }

        visit(node);
        return node;
      });
    }

    visit(tree);
  };
}

export const userMessageRemarkPlugins = [
  ...Object.values(defaultRemarkPlugins),
  literalUnsupportedMarkdown,
];
