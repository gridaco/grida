import { fromMarkdown } from "mdast-util-from-markdown";

type MarkdownNode = {
  type: string;
  url?: string;
  title?: string | null;
  value?: string;
  children?: readonly MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

/** A passive relative Markdown link shared by the draft and the sent message. */
export namespace WorkspaceMention {
  export function name(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
  }

  export function escapeLabel(label: string): string {
    return label
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  export function parse(
    href: string,
    title: string | null | undefined
  ): { kind: "file" | "folder"; path: string } | undefined {
    const kind =
      title === "Workspace file"
        ? "file"
        : title === "Workspace folder"
          ? "folder"
          : undefined;
    if (!kind || !href.startsWith("./")) return;
    try {
      const path = decodeURIComponent(href.slice(2));
      const parts = path.split("/");
      if (
        /[\\\p{Cc}]/u.test(path) ||
        parts.some((part) => !part || part === "." || part === "..")
      )
        return;
      return { kind, path };
    } catch {
      return;
    }
  }

  export function target(path: string, kind: "file" | "folder") {
    // Keep ordinary paths readable and escape Markdown destination delimiters.
    const href = "./" + path.replace(/[%<>&?#\\]/g, encodeURIComponent);
    const title = kind === "file" ? "Workspace file" : "Workspace folder";
    return `<${href}> "${title}"`;
  }

  export function inline(text: string) {
    if (!text.includes('"Workspace ')) return [];
    const matches: {
      from: number;
      to: number;
      label: string;
      path: string;
      kind: "file" | "folder";
    }[] = [];
    function visit(node: MarkdownNode) {
      if (node.type === "link" && node.url) {
        const { title, children, position } = node;
        const entry = parse(node.url, title);
        const label =
          children?.length === 1 && children[0].type === "text"
            ? children[0].value
            : undefined;
        const from = position?.start.offset;
        const to = position?.end.offset;
        if (
          entry &&
          label !== undefined &&
          from !== undefined &&
          to !== undefined
        )
          matches.push({ from, to, label, ...entry });
      } else {
        node.children?.forEach(visit);
      }
    }
    fromMarkdown(text).children.forEach(visit);
    return matches;
  }

  function project(text: string, field: "label" | "path"): string {
    let start = 0;
    let output = "";
    for (const mention of inline(text)) {
      output += text.slice(start, mention.from) + mention[field];
      start = mention.to;
    }
    return output + text.slice(start);
  }

  export function plainText(text: string): string {
    return project(text, "label");
  }

  export function copyText(text: string): string {
    return project(text, "path");
  }

  export function previewText(text: string): string {
    if (!text.endsWith("…")) return plainText(text);
    // Snapshots can clip a destination or its title. Reparse the trailing
    // relative link with a complete destination so code and escaped text
    // still follow the Markdown parser's normal rules.
    const delimiter = text.lastIndexOf("](<./");
    if (delimiter < 0) return plainText(text);
    const tail = text.slice(delimiter + "](<./".length, -1);
    const end = tail.indexOf(">");
    if (
      tail.includes("\n") ||
      (end !== -1 &&
        !['> "Workspace file")', '> "Workspace folder")'].some((ending) =>
          ending.startsWith(tail.slice(end))
        ))
    )
      return plainText(text);
    const candidate =
      text.slice(0, delimiter + 1) + '(<./preview> "Workspace file")';
    const last = inline(candidate).at(-1);
    return last?.to === candidate.length
      ? plainText(candidate) + "…"
      : plainText(text);
  }
}
