import { describe, expect, it } from "vitest";
import { ComposerCore, type ComposerAttachmentFilter } from "./composer-core";

describe("ComposerCore", () => {
  it("rejects empty messages by default", () => {
    const core = new ComposerCore();

    expect(core.createMessage({ submitted_at: 1 })).toBeNull();

    core.ingestDocument({
      text: "   ",
      document: {
        type: "doc",
        children: [{ type: "paragraph", children: [] }],
      },
    });

    expect(core.createMessage({ submitted_at: 1 })).toBeNull();
    expect(
      core.createMessage({ submitted_at: 1, allow_empty: true })
    ).toMatchObject({
      role: "user",
      parts: [],
    });
  });

  it("does not count editor context alone as submit-worthy content", () => {
    const core = new ComposerCore();

    core.setContexts([
      {
        kind: "selection",
        source: "mock",
        payload: { path: "src/a.ts" },
        emitted_at: 1,
      },
    ]);

    expect(core.createMessage({ submitted_at: 1 })).toBeNull();
    expect(
      core.createMessage({ submitted_at: 1, allow_empty: true })
    ).toMatchObject({
      parts: [{ type: "editor-context", kind: "selection" }],
    });
  });

  it("clones editor contexts before storing them", () => {
    const core = new ComposerCore();
    const contexts = [
      {
        kind: "selection",
        payload: { nested: { path: "src/a.ts" } },
        emitted_at: 1,
      },
    ];

    core.setContexts(contexts);
    contexts[0].payload.nested = { path: "src/b.ts" };

    expect(core.getSnapshot().contexts[0]).toMatchObject({
      payload: { nested: { path: "src/a.ts" } },
    });
  });

  it("detects slash command triggers", () => {
    const core = new ComposerCore({
      commands: [{ id: "review", title: "Review" }],
    });

    core.inspectCursor("please /rev", 11);

    expect(core.getSnapshot().trigger).toMatchObject({
      kind: "command",
      query: "rev",
      range: { from: 7, to: 11 },
      items: [{ id: "review" }],
    });
  });

  it("moves trigger index inside the core state", () => {
    const core = new ComposerCore({
      commands: [
        { id: "review", title: "Review" },
        { id: "rewrite", title: "Rewrite" },
      ],
    });

    core.inspectCursor("/", 1);
    core.moveTriggerIndex(1);

    expect(core.getSnapshot()).toMatchObject({
      triggerIndex: 1,
    });

    core.moveTriggerIndex(1);

    expect(core.getSnapshot()).toMatchObject({
      triggerIndex: 0,
    });
  });

  it("refreshes the active trigger when the catalog changes", () => {
    const core = new ComposerCore({
      commands: [{ id: "review", title: "Review" }],
    });

    core.inspectCursor("/re", 3);
    core.setCatalog({
      commands: [
        { id: "review", title: "Review" },
        { id: "rewrite", title: "Rewrite" },
      ],
    });

    expect(core.getSnapshot().trigger?.items.map((item) => item.id)).toEqual([
      "review",
      "rewrite",
    ]);
  });

  it("does not publish when ingested document and trigger are unchanged", () => {
    const core = new ComposerCore({
      commands: [{ id: "review", title: "Review" }],
    });
    let publishes = 0;
    core.subscribe(() => {
      publishes += 1;
    });

    const document = {
      type: "doc" as const,
      children: [
        {
          type: "paragraph" as const,
          children: [{ type: "text" as const, text: "hi" }],
        },
      ],
    };

    core.ingestDocument({ text: "hi", document });
    core.ingestDocument({ text: "hi", document });
    core.inspectCursor("/rev", 4);
    core.inspectCursor("/rev", 4);

    expect(publishes).toBe(2);
  });

  it("lowers command, mention, file ref, attachment, and context parts", () => {
    const core = new ComposerCore({
      commands: [
        {
          id: "review",
          title: "Review",
        },
      ],
      mentions: [
        {
          id: "skill-canvas",
          kind: "skill",
          label: "canvas-docs-svg-kit",
        },
      ],
    });

    core.ingestDocument({
      text: "/review @canvas",
      document: {
        type: "doc",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "command",
                id: "review",
              },
              { type: "text", text: " src/a.ts critical " },
              {
                type: "mention",
                id: "skill-canvas",
                kind: "skill",
                label: "canvas-docs-svg-kit",
              },
              { type: "text", text: " use " },
              {
                type: "file-ref",
                path: "src/a.ts",
                name: "a.ts",
              },
            ],
          },
        ],
      },
    });
    core.addAttachment({
      id: "1",
      name: "screen.png",
      mime: "image/png",
      size: 100,
    });
    core.setContexts([
      {
        kind: "selection",
        source: "mock",
        payload: { path: "src/a.ts" },
        emitted_at: 1,
      },
    ]);

    expect(core.createMessage({ submitted_at: 2 })).toMatchObject({
      role: "user",
      parts: [
        {
          type: "command",
          id: "review",
        },
        { type: "text", text: "src/a.ts critical" },
        {
          type: "mention",
          target: { kind: "skill", id: "skill-canvas" },
        },
        { type: "text", text: "use" },
        { type: "file-ref", ref: { path: "src/a.ts", name: "a.ts" } },
        { type: "file-attachment", name: "screen.png" },
        { type: "editor-context", kind: "selection" },
      ],
      meta: { submitted_at: 2 },
    });
  });

  it("preserves file mentions as mentions instead of converting them to references", () => {
    const core = new ComposerCore({
      mentions: [
        {
          id: "file-a",
          kind: "file",
          label: "a.ts",
          path: "src/a.ts",
        },
      ],
    });

    core.ingestDocument({
      text: "@a.ts",
      document: {
        type: "doc",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "mention",
                id: "file-a",
                kind: "file",
                label: "a.ts",
                path: "src/a.ts",
              },
            ],
          },
        ],
      },
    });

    expect(core.createMessage({ submitted_at: 1 })).toMatchObject({
      parts: [
        {
          type: "mention",
          target: {
            id: "file-a",
            kind: "file",
            label: "a.ts",
            path: "src/a.ts",
          },
        },
      ],
    });
  });

  it("does not expose raw editor html or json in submitted message meta", () => {
    const core = new ComposerCore();

    core.ingestDocument({
      text: "hello",
      document: {
        type: "doc",
        children: [
          { type: "paragraph", children: [{ type: "text", text: "hello" }] },
        ],
      },
    });

    const message = core.createMessage({ submitted_at: 1 });

    expect(message?.meta).toMatchObject({ text: "hello", submitted_at: 1 });
    expect(message?.meta).not.toHaveProperty("html");
    expect(message?.meta).not.toHaveProperty("json");
  });

  it("allocates unique attachment ids while allowing duplicate inputs", () => {
    const core = new ComposerCore();

    const first = core.addAttachment({
      name: "screen.png",
      path: "screen.png",
    });
    const second = core.addAttachment({
      name: "screen.png",
      path: "screen.png",
    });

    expect(first?.id).toBe("attachment-1-screen-png");
    expect(second?.id).toBe("attachment-2-screen-png");
    expect(core.getSnapshot().attachments).toHaveLength(2);
  });

  it("lets consumers filter duplicate attachments", () => {
    const core = new ComposerCore();
    const filter: ComposerAttachmentFilter = (incoming, existing) =>
      !existing.some((attachment) => attachment.path === incoming.path);

    const first = core.addAttachment(
      {
        name: "screen.png",
        path: "screen.png",
      },
      { filter }
    );
    const second = core.addAttachment(
      {
        name: "screen.png",
        path: "screen.png",
      },
      { filter }
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(core.getSnapshot().attachments).toHaveLength(1);
  });
});
