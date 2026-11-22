import { defaultRemarkPlugins } from "streamdown";

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
