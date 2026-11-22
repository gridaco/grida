import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { ComposerCore } from "./composer-core";
import { ComposerTiptap } from "./composer-tiptap";

describe("ComposerTiptap", () => {
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
