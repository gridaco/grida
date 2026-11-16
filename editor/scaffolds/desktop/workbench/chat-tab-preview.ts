import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/** Bounded, visible transcript excerpts for an informational tab preview. */
export namespace ChatTabPreview {
  export type Message = Readonly<{
    role: "user" | "assistant";
    text: string;
    attachments?: readonly Readonly<{ name: string }>[];
  }>;

  /** A chat already owned by its surface; observation starts no work. */
  export type Source = Readonly<{
    read: () => Readonly<{ messages: readonly Message[] }>;
    subscribe: (listener: () => void) => () => void;
  }>;

  export type Excerpt = Readonly<{
    role: Message["role"];
    text: string;
  }>;

  export const MAX_EXCERPT_LENGTH = 360;
  const MAX_MARKDOWN_LENGTH = 16 * 1024;
  const markdownOptions = {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  };

  type MarkdownNode = Readonly<{
    type: string;
    value?: string;
    alt?: string | null;
    children?: readonly MarkdownNode[];
  }>;

  /** The last visible message of each role, in transcript order. */
  export function latest(messages: readonly Message[]): readonly Excerpt[] {
    const excerpts: Excerpt[] = [];
    const found = new Set<Message["role"]>();
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (found.has(message.role)) continue;
      const text = plainText(message.text);
      const attachment = message.attachments?.[0];
      const visible = text || (attachment && compact(attachment.name));
      if (!visible) continue;
      excerpts.push({ role: message.role, text: visible });
      found.add(message.role);
      if (found.size === 2) break;
    }
    return excerpts.reverse();
  }

  function plainText(markdown: string): string {
    // Parsing is bounded independently of how much transcript text was retained.
    const source = markdown.slice(0, MAX_MARKDOWN_LENGTH);
    let root: MarkdownNode;
    try {
      root = fromMarkdown(source, markdownOptions);
    } catch {
      // Pathological nesting must not take down the tab's informational preview.
      return compact(source, markdown.length > source.length);
    }
    const pending: (MarkdownNode | string)[] = [root];
    const fragments: string[] = [];
    while (pending.length) {
      const node = pending.pop()!;
      if (typeof node === "string") {
        fragments.push(node);
        continue;
      }
      switch (node.type) {
        case "text":
        case "inlineCode":
        case "code":
        // HTML source remains literal text; the preview never interprets it.
        case "html":
          fragments.push(node.value ?? "");
          break;
        case "image":
        case "imageReference":
          fragments.push(node.alt ?? "");
          break;
        case "break":
          fragments.push(" ");
          break;
        case "definition":
          break;
        default: {
          const children = node.children ?? [];
          const inline = [
            "paragraph",
            "heading",
            "emphasis",
            "strong",
            "delete",
            "link",
            "linkReference",
            "tableCell",
          ].includes(node.type);
          for (let index = children.length - 1; index >= 0; index--) {
            pending.push(children[index]);
            if (index > 0 && !inline) pending.push(" ");
          }
        }
      }
    }
    return compact(fragments.join(""), markdown.length > source.length);
  }

  function compact(text: string, truncated = false): string {
    const normalized = text.trim().replace(/\s+/g, " ");
    return normalized.length > MAX_EXCERPT_LENGTH ||
      (truncated && normalized.length > 0)
      ? `${normalized.slice(0, MAX_EXCERPT_LENGTH - 1).trimEnd()}…`
      : normalized;
  }
}
