import { describe, expect, it } from "vitest";
import { ComposerTiptap } from "./composer-tiptap";

describe("ComposerTiptap", () => {
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
});
