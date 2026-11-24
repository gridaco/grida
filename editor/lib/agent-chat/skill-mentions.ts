import { fromMarkdown } from "mdast-util-from-markdown";
import type { JSONContent } from "@tiptap/core";
import {
  NativeChatSkills,
  type NativeChatDisplayPart,
  type NativeChatSkill,
  type NativeChatSkillReference,
} from "@grida/desktop-bridge";
import type { ComposerMention, ComposerMessage } from "@/kits/composer";
import { ComposerTiptap } from "../../kits/composer/composer-tiptap";

export namespace SkillMentions {
  const EMPTY: ComposerMention[] = [];
  const RETAINED = "retained-skill";

  export class Catalog {
    private items = EMPTY;
    private pending?: Promise<void>;
    private readonly listeners = new Set<() => void>();

    constructor(
      private readonly list:
        | ((workspaceId?: string) => Promise<readonly NativeChatSkill[]>)
        | undefined,
      private readonly workspaceId?: string
    ) {}

    readonly read = () => this.items;

    readonly subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    };

    readonly release = () => {
      this.pending = undefined;
    };

    readonly refresh = (): Promise<void> | undefined => {
      if (!this.list) return;
      if (this.pending) return this.pending;
      const request: Promise<void> = this.list(this.workspaceId).then(
        (skills) => this.settle(request, catalog(skills, this.workspaceId)),
        () => this.settle(request, EMPTY)
      );
      return (this.pending = request);
    };

    private settle(request: Promise<void>, items: ComposerMention[]) {
      if (this.pending !== request) return;
      this.pending = undefined;
      this.items = items;
      for (const listener of this.listeners) listener();
    }
  }

  export function sourceLabel(
    source: unknown,
    extension?: unknown
  ): string | undefined {
    if (typeof extension === "string" && extension) return extension;
    switch (source) {
      case "project_agents":
        return "Project";
      case "project_claude":
        return "Project (.claude)";
      case "personal":
        return "Personal";
      case "bundled":
        return "Bundled";
      default:
        return undefined;
    }
  }

  export function catalog(
    skills: readonly NativeChatSkill[],
    workspaceId?: string
  ): ComposerMention[] {
    return skills.map(({ name, extension, description, source, uri }) => {
      const project =
        source === "project_agents" || source === "project_claude";
      return {
        id: uri,
        label: extension ? `${extension}/${name}` : name,
        source: sourceLabel(source, extension),
        description,
        payload: {
          name,
          uri,
          ...(project && workspaceId && { workspaceId }),
        },
      };
    });
  }

  export function selected(
    message: ComposerMessage,
    editing = false
  ): readonly NativeChatSkillReference[] | undefined {
    const unique = new Map<string, unknown>();
    for (const part of message.parts) {
      if (
        part.type === "mention" &&
        part.target.sigil === "$" &&
        !(editing && part.target.kind === RETAINED)
      )
        unique.set(part.target.id, part.target.payload);
    }
    if (!unique.size) return undefined;
    if (unique.size > NativeChatSkills.maxSelected)
      throw new Error(
        `Choose up to ${NativeChatSkills.maxSelected} skills per message.`
      );
    const skills = NativeChatSkills.references([...unique.values()]);
    if (!skills)
      throw new Error("Remove the unavailable skill and choose it again.");
    return skills;
  }

  export function same(
    left: readonly NativeChatSkillReference[] | undefined,
    right: readonly NativeChatSkillReference[] | undefined
  ): boolean {
    return (
      (left?.length ?? 0) === (right?.length ?? 0) &&
      (left?.every(
        (skill, index) =>
          skill.uri === right?.[index]?.uri &&
          skill.workspaceId === right?.[index]?.workspaceId
      ) ??
        true)
    );
  }

  export function display(
    skills: readonly NativeChatSkillReference[] | undefined,
    parts: readonly NativeChatDisplayPart[] | undefined
  ): readonly NativeChatDisplayPart[] | undefined {
    if (!skills?.length) return parts;
    return [
      ...skills.map(({ name, uri }) => {
        const extension = NativeChatSkills.selector(uri)?.extension;
        return {
          kind: "skill",
          version: 1,
          data: { name, uri, ...(extension && { extension }) },
        };
      }),
      ...(parts ?? []),
    ];
  }

  type BoundLabel = { label: string; source?: string };
  type Inline = BoundLabel & { from: number; to: number; uri: string };
  type MarkdownNode = {
    type: string;
    url?: string;
    children?: readonly MarkdownNode[];
    position?: { start: { offset?: number }; end: { offset?: number } };
  };

  export function markup(label: string, uri: string): string {
    return `[${label}](${uri})`;
  }

  /** Find exact, bound links in Markdown. Text such as code examples stays literal. */
  export function inline(text: string, parts?: readonly unknown[]): Inline[] {
    if (!text.includes("](grida-skill:") || !parts?.length) return [];
    const labels = boundLabels(parts);
    if (!labels.size) return [];

    const matches: Inline[] = [];
    function visit(node: MarkdownNode) {
      if (node.type === "link" && node.url) {
        const binding = labels.get(node.url);
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (
          binding &&
          from !== undefined &&
          to !== undefined &&
          text.slice(from, to) === markup(binding.label, node.url)
        )
          matches.push({ ...binding, from, to, uri: node.url });
      } else {
        node.children?.forEach(visit);
      }
    }
    visit(fromMarkdown(text));
    return matches;
  }

  function boundLabels(parts?: readonly unknown[]): Map<string, BoundLabel> {
    const labels = new Map<string, BoundLabel>();
    for (const part of parts ?? []) {
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
        continue;
      const selector = NativeChatSkills.selector(part.data.uri);
      if (!selector) continue;
      const { name, extension } = selector;
      const source = sourceLabel(
        "source" in part.data ? part.data.source : undefined,
        extension
      );
      labels.set(part.data.uri, {
        label: `$${extension ? `${extension}/` : ""}${name}`,
        ...(source && { source }),
      });
    }
    return labels;
  }

  export function plainText(text: string, parts?: readonly unknown[]): string {
    let start = 0;
    let output = "";
    for (const match of inline(text, parts)) {
      output += text.slice(start, match.from) + match.label;
      start = match.to;
    }
    return output + text.slice(start);
  }

  /** Queue summaries can end inside a link after native preview truncation. */
  export function previewText(
    text: string,
    parts?: readonly unknown[]
  ): string {
    const plain = plainText(text, parts);
    if (!plain.endsWith("…")) return plain;
    const start = plain.lastIndexOf("[$");
    if (start < 0) return plain;
    const tail = plain.slice(start, -1);
    for (const [uri, { label }] of boundLabels(parts)) {
      if (tail.includes("](") && markup(label, uri).startsWith(tail))
        return plain.slice(0, start) + label + "…";
    }
    return plain;
  }

  /** A queued caption can be edited while its captured skill remains pinned. */
  export function retainedDocument(text: string, parts?: readonly unknown[]) {
    const matches = inline(text, parts);
    if (!matches.length) return;
    const skills = new Map<string, NativeChatSkillReference>();
    for (const { uri } of matches) {
      const { name } = NativeChatSkills.selector(uri)!;
      skills.set(uri, { name, uri });
    }
    return restore(text, [...skills.values()], matches, RETAINED);
  }

  export function restoreDocument(
    text: string,
    skills: readonly NativeChatSkillReference[] | undefined
  ) {
    return restore(
      text,
      skills ?? [],
      inline(text, display(skills, undefined))
    );
  }

  export function recalledDocument(
    text: string,
    parts: readonly unknown[] | undefined,
    workspaceId?: string
  ) {
    const matches = inline(text, parts);
    if (!matches.length) return;
    const references = (parts ?? []).flatMap((part) => {
      const skill = NativeChatSkills.displayPart(part);
      if (!skill || !matches.some(({ uri }) => uri === skill.uri)) return [];
      const { name, uri, source } = skill;
      const project =
        source === "project_agents" || source === "project_claude";
      return [{ name, uri, ...(project && workspaceId && { workspaceId }) }];
    });
    if (!references.length) return;
    // Unmarked text was authored without a picker selection. Recall it as text
    // so the next submission resolves it against the current skill sources.
    return restore(
      text,
      references,
      matches.filter(({ uri }) => references.some((skill) => skill.uri === uri))
    );
  }

  function restore(
    text: string,
    skills: readonly NativeChatSkillReference[],
    matches: Inline[],
    kind?: string
  ): { type: "doc"; content: JSONContent[] } {
    const references = new Map(skills.map((skill) => [skill.uri, skill]));
    const positioned = new Set<string>();
    const content = [{ type: "paragraph", content: [] as JSONContent[] }];
    const replacements = new Map<string, JSONContent>();
    const marker = "#grida-composer-mention-";
    let markdown = "";
    function appendText(value: string) {
      const [first, ...rest] = value.split(/\r?\n/);
      if (first) content.at(-1)!.content.push({ type: "text", text: first });
      for (const line of rest) {
        content.push({
          type: "paragraph",
          content: line ? [{ type: "text", text: line }] : [],
        });
      }
    }
    let start = 0;
    for (const match of matches) {
      const skill = references.get(match.uri)!;
      const before = text.slice(start, match.from);
      const node = draftMention(skill, match.label.slice(1), kind);
      const href = marker + match.from;
      replacements.set(href, node);
      markdown += before + markup(match.label, href);
      appendText(before);
      content.at(-1)!.content.push(node);
      positioned.add(match.uri);
      start = match.to;
    }
    appendText(text.slice(start));

    const formatted =
      skills.length && !text.includes(marker)
        ? ComposerTiptap.markdownDocument(markdown + text.slice(start))
        : undefined;
    const parsed = formatted?.content?.map(function replace(node): JSONContent {
      const mark = node.marks?.find(({ type }) => type === "link");
      const href = mark?.attrs?.href;
      const mention = replacements.get(href);
      if (!mention)
        return node.content
          ? { ...node, content: node.content.map(replace) }
          : node;
      replacements.delete(href);
      const marks = node.marks?.filter((entry) => entry !== mark);
      return marks?.length ? { ...mention, marks } : mention;
    });
    const blocks = parsed && !replacements.size ? parsed : content;

    // Older recoverable drafts carry their bindings alongside unmarked text.
    const preceding = skills.filter(({ uri }) => !positioned.has(uri));
    if (preceding.length) {
      blocks.unshift({
        type: "paragraph",
        content: preceding.flatMap<JSONContent>((skill) => {
          const extension = NativeChatSkills.selector(skill.uri)?.extension;
          return [
            draftMention(
              skill,
              extension ? `${extension}/${skill.name}` : skill.name
            ),
            { type: "text", text: " " },
          ];
        }),
      });
    }
    return { type: "doc", content: blocks };
  }

  function draftMention(
    reference: NativeChatSkillReference,
    label: string,
    kind?: string
  ) {
    return {
      type: "composerMention",
      attrs: {
        id: reference.uri,
        label,
        sigil: "$",
        ...(kind && { kind }),
        payload: JSON.stringify(reference),
      },
    };
  }

  export function refusal(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined;
    if (/\bnative_chat_skill_selection_unsupported\b/.test(error.message))
      return "Skill selection is unavailable in this chat.";
    if (/\bnative_chat_skill_requires_new_turn\b/.test(error.message))
      return "Send skill selections in a new chat turn.";
    if (/\bselected_skill_changed\b/.test(error.message))
      return "A selected skill changed. Remove it and select its current version.";
    if (/\bselected_skill_unavailable\b/.test(error.message))
      return "A selected skill is unavailable here. Remove it or choose another skill.";
  }
}
