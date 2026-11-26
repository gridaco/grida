import { describe, expect, it } from "vitest";
import { generateText, getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { ComposerCore } from "./composer-core";
import { ComposerTiptap } from "./composer-tiptap";
import { WorkspaceMention } from "./workspace-mention";

describe("ComposerTiptap", () => {
  it("appends a recovered mention to nonempty text without replacing the caret or the typed block", () => {
    const schema = getSchema(ComposerTiptap.extensions({ placeholder: "" }));
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "New typing" }] },
      ],
    });
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 4),
    });
    const recovered = ComposerTiptap.markdownDocument(
      '[notes.md](<./work/notes.md> "Workspace file")'
    )!;
    const append = ComposerTiptap.appendDocument(state, recovered.content!);
    expect(append?.doc.toJSON().content).toEqual([
      ...doc.toJSON().content,
      ...recovered.content!,
    ]);
    expect(append?.selection.from).toBe(4);
  });

  it("uses the filename in the draft, keeps the exact path inline, and restores the mention", () => {
    const extensions = ComposerTiptap.extensions({ placeholder: "" });
    const schema = getSchema(extensions);
    const path = "pet-fx notes/AGENTS.md";
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Read " },
            {
              type: "composerMention",
              attrs: { id: path, label: path, kind: "file", path },
            },
          ],
        },
      ],
    };
    const doc = schema.nodeFromJSON(json);
    const mention = doc.child(0).child(1);
    expect(mention.type.spec.toDOM?.(mention)).toMatchObject([
      "span",
      { title: path },
      "AGENTS.md",
    ]);
    expect(generateText(json, extensions)).toBe("Read AGENTS.md");
    const text = ComposerTiptap.formattedMarkdown(doc)!;
    expect(text).toBe(
      'Read [AGENTS.md](<./pet-fx notes/AGENTS.md> "Workspace file")'
    );
    expect(WorkspaceMention.plainText(text)).toBe("Read AGENTS.md");
    expect(WorkspaceMention.copyText(text)).toBe("Read pet-fx notes/AGENTS.md");
    expect(ComposerTiptap.markdownDocument(text)).toMatchObject({
      content: [
        {
          content: [
            { type: "text", text: "Read " },
            {
              type: "composerMention",
              attrs: { id: path, label: "AGENTS.md", kind: "file", path },
            },
          ],
        },
      ],
    });
  });

  it("keeps the selected path when the author revises text around the mention", () => {
    const initial =
      'Read **[AGENTS.md](<./pet-fx/AGENTS.md> "Workspace file")**';
    const schema = getSchema(ComposerTiptap.extensions({ placeholder: "" }));
    const revision = schema.nodeFromJSON(
      ComposerTiptap.markdownDocument(initial)!
    );
    expect(revision.child(0).child(1).type.name).toBe("composerMention");
    const edited = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Summarize "),
        revision.child(0).child(1),
      ]),
    ]);
    expect(ComposerTiptap.formattedMarkdown(edited)).toBe(
      'Summarize **[AGENTS.md](<./pet-fx/AGENTS.md> "Workspace file")**'
    );
  });

  it("keeps the filename when a queue preview clips the link destination or title", () => {
    for (const preview of [
      "Read [AGENTS.md](<./pet-fx/AGE…",
      'Read [AGENTS.md](<./pet-fx/AGENTS.md> "Workspace fi…',
    ]) {
      expect(WorkspaceMention.previewText(preview)).toBe("Read AGENTS.md…");
    }
    expect(WorkspaceMention.previewText("Read \\[AGENTS.md](<./pet-fx…")).toBe(
      "Read \\[AGENTS.md](<./pet-fx…"
    );
  });

  it("restores references beside unsupported literal Markdown in a revision", () => {
    const text =
      '# Notes\nRead [AGENTS.md](<./pet-fx/AGENTS.md> "Workspace file")';
    const extensions = ComposerTiptap.extensions({ placeholder: "" });
    const schema = getSchema(extensions);
    const restored = ComposerTiptap.markdownDocument(text)!;
    expect(generateText(restored, extensions, { blockSeparator: "\n" })).toBe(
      "# Notes\nRead AGENTS.md"
    );
    expect(
      ComposerTiptap.formattedMarkdown(schema.nodeFromJSON(restored))
    ).toBe(
      '# Notes\n\nRead [AGENTS.md](<./pet-fx/AGENTS.md> "Workspace file")'
    );
  });

  it("round trips a workspace folder with spaces and Markdown delimiters", () => {
    const path = "drafts/Résumé [50%] <Q4> #1";
    const schema = getSchema(ComposerTiptap.extensions({ placeholder: "" }));
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Compare " },
            {
              type: "composerMention",
              attrs: { id: path, kind: "folder", path },
            },
          ],
        },
      ],
    });
    const text = ComposerTiptap.formattedMarkdown(doc)!;
    expect(WorkspaceMention.plainText(text)).toBe(
      "Compare Résumé [50%] <Q4> #1"
    );
    expect(ComposerTiptap.markdownDocument(text)).toMatchObject({
      content: [
        {
          content: [
            { type: "text", text: "Compare " },
            { type: "composerMention", attrs: { kind: "folder", path } },
          ],
        },
      ],
    });
  });

  it("preserves ordered list starts, nested bullets, code, and inline references in Markdown", () => {
    const schema = getSchema(ComposerTiptap.extensions({ placeholder: "" }));
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "**Review notes**" }],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Check " },
                    {
                      type: "composerMention",
                      attrs: {
                        id: "readme",
                        label: "README",
                        path: "README.md",
                      },
                    },
                    { type: "hardBreak" },
                    { type: "text", text: "One more note" },
                  ],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "verify",
                              marks: [{ type: "code" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(ComposerTiptap.formattedMarkdown(doc)).toBe(
      [
        "**Review notes**",
        "",
        "3. Check @README\\",
        "   One more note",
        "   - `verify`",
      ].join("\n")
    );
    expect(
      ComposerTiptap.formattedMarkdown(schema.node("doc", null, doc.child(0)))
    ).toBeUndefined();
  });

  it("serializes a chosen skill in place and preserves literal dollar text", () => {
    const extensions = ComposerTiptap.extensions({ placeholder: "" });
    const schema = getSchema(extensions);
    const uri = "grida-skill:slides@" + "a".repeat(64);
    const json = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Use " },
            {
              type: "composerMention",
              attrs: {
                id: uri,
                label: "slides",
                sigil: "$",
                payload: JSON.stringify({ name: "slides", uri }),
              },
            },
            { type: "text", text: " for $100, then type $slides." },
          ],
        },
      ],
    };
    const doc = schema.nodeFromJSON(json);
    const mention = doc.child(0).child(1);
    expect(mention.type.spec.toDOM?.(mention)).toMatchObject([
      "span",
      { sigil: "$", "data-composer-mention": uri },
      "slides",
    ]);
    expect(ComposerTiptap.formattedMarkdown(doc)).toBe(
      "Use [$slides](" + uri + ") for $100, then type $slides."
    );
    expect(generateText(json, extensions)).toBe(
      "Use $slides for $100, then type $slides."
    );
    expect(ComposerTiptap.toDocument(json).children[0]).toMatchObject({
      children: [
        { type: "text" },
        { type: "mention", sigil: "$", id: uri },
        { type: "text" },
      ],
    });
  });

  it("maps Tiptap command, mention, file ref, list, and code nodes to composer document nodes", () => {
    expect(
      ComposerTiptap.toDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "composerCommand",
                attrs: { id: "review", title: "Review" },
              },
              { type: "text", text: " check " },
              {
                type: "composerMention",
                attrs: {
                  id: "file-a",
                  label: "a.ts",
                  kind: "file",
                  path: "src/a.ts",
                  payload: JSON.stringify({ source: "mock" }),
                },
              },
              {
                type: "composerFileReference",
                attrs: {
                  path: "src/a.ts",
                  name: "a.ts",
                  mime: "text/typescript",
                  size: 100,
                  url: "/src/a.ts",
                  payload: JSON.stringify({ ref: true }),
                },
              },
            ],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "one" }],
                  },
                ],
              },
            ],
          },
          {
            type: "codeBlock",
            content: [{ type: "text", text: "const x = 1;" }],
          },
        ],
      })
    ).toEqual({
      type: "doc",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "command", id: "review", title: "Review" },
            { type: "text", text: " check ", code: undefined },
            {
              type: "mention",
              id: "file-a",
              label: "a.ts",
              kind: "file",
              path: "src/a.ts",
              payload: { source: "mock" },
            },
            {
              type: "file-ref",
              path: "src/a.ts",
              name: "a.ts",
              mime: "text/typescript",
              size: 100,
              url: "/src/a.ts",
              payload: { ref: true },
            },
          ],
        },
        {
          type: "list",
          ordered: false,
          items: [
            [
              {
                type: "paragraph",
                children: [{ type: "text", text: "one", code: undefined }],
              },
            ],
          ],
        },
        { type: "code-block", text: "const x = 1;" },
      ],
    });
  });

  it("does not submit or select trigger items during IME composition", () => {
    const core = new ComposerCore({
      commands: [{ id: "review", title: "Review" }],
    });
    core.inspectCursor("/", 1);
    let prevented = false;
    let submitted = false;

    const handled = ComposerTiptap.handleKeyDown({
      core,
      editor: null,
      event: {
        isComposing: true,
        key: "Enter",
        preventDefault() {
          prevented = true;
        },
        shiftKey: false,
      } as KeyboardEvent,
      triggerIndex: 0,
      moveTriggerIndex() {},
      submit() {
        submitted = true;
      },
    });

    expect(handled).toBe(false);
    expect(prevented).toBe(false);
    expect(submitted).toBe(false);
  });

  it("dismisses completion on Escape without submitting or editing", () => {
    const core = new ComposerCore({
      commands: [{ id: "review", title: "Review" }],
    });
    core.inspectCursor("/re", 3);
    let submitted = false;
    let prevented = false;
    const handled = ComposerTiptap.handleKeyDown({
      core,
      editor: null,
      event: {
        key: "Escape",
        preventDefault() {
          prevented = true;
        },
      } as KeyboardEvent,
      triggerIndex: 0,
      moveTriggerIndex() {},
      submit() {
        submitted = true;
      },
    });
    expect(handled).toBe(true);
    expect(prevented).toBe(true);
    expect(submitted).toBe(false);
    expect(core.getSnapshot().trigger).toBeNull();
  });
});
