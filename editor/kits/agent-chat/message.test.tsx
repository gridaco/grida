import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/agent-chat/types";
import { chat_vocabulary } from "@/lib/agent-chat/chat-vocabulary";
import { native_message_parts } from "@/lib/agent-chat/native-message-parts";
import { native_tool_parts } from "@/lib/agent-chat/native-tool-parts";
import {
  IMAGE_REFERENCE_PART,
  imagesMessageContext,
} from "@/lib/desktop/images-message-context";
import {
  slidesTemplateMessageContext,
  SLIDES_TEMPLATE_PART,
} from "@/lib/desktop/slides-message-context";
import { workflowMessageContext } from "@/lib/desktop/workflow-message-context";
import { ChatMessageView, type ChatMessageActions } from "./message";

const actions = vi.hoisted(
  () =>
    [] as Array<
      ComponentProps<
        (typeof import("@app/ui/ai-elements/message"))["MessageAction"]
      >
    >
);
vi.mock("@app/ui/ai-elements/message", async (original) => {
  const primitives =
    await original<typeof import("@app/ui/ai-elements/message")>();
  return {
    ...primitives,
    MessageAction: (props: ComponentProps<typeof primitives.MessageAction>) => {
      actions.push(props);
      return <primitives.MessageAction {...props} />;
    },
  };
});

const POSTER = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
beforeEach(() => {
  actions.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function files(entries: unknown[]): ChatMessage["parts"][number] {
  return {
    type: "data-user_file_attachments",
    data: { files: entries },
  } as unknown as ChatMessage["parts"][number];
}

function render(parts: ChatMessage["parts"], controls?: ChatMessageActions) {
  return renderToStaticMarkup(
    <ChatMessageView
      message={{ id: "ask", role: "user", parts }}
      actions={controls}
    />
  );
}

it("shows one passive SVG selection marker on the accepted user message", () => {
  const parts = native_message_parts.of({
    messageId: "selected",
    role: "user",
    text: "Inspect these shapes.",
    svgTextSelection: true,
    svgSelection: true,
  });
  expect(parts[0]).toEqual({ type: "data-svg-selection", data: true });
  const html = render(parts);
  expect(html).toContain("SVG selection");
  expect(html).not.toContain("SVG text selection");
});

/** Extract an actual rendered element including nested elements of its tag. */
function region(html: string, attribute: string): string | null {
  const position = html.indexOf(attribute);
  if (position < 0) return null;
  const start = html.lastIndexOf("<", position);
  const tag = /^<([a-z0-9]+)/.exec(html.slice(start))![1];
  const elements = new RegExp(`</?${tag}(?=\\s|>)[^>]*>`, "g");
  elements.lastIndex = start;
  let depth = 0;
  for (let match = elements.exec(html); match; match = elements.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, elements.lastIndex);
  }
  throw new Error("unbalanced rendered element");
}

describe("tool call icons", () => {
  it.each([
    { toolName: "workbench_list_tabs", icon: "lucide-monitor" },
    { toolName: "browser_snapshot", icon: "lucide-monitor" },
    { toolName: "other_tool", icon: "lucide-wrench" },
  ])("renders the icon for $toolName", ({ toolName, icon }) => {
    expect(renderToolCalls(toolName)).toContain(icon);
  });

  it("uses a monitor on a collapsed group dominated by desktop tools", () => {
    const html = renderToolCalls(
      "workbench_list_tabs",
      "browser_snapshot",
      "other_tool"
    );
    expect(html.match(/<svg[^>]*>/)?.[0]).toContain("lucide-monitor");
    expect(html).toContain("Used 2 desktop tools, used 1 tool call");
  });

  function renderToolCalls(...toolNames: string[]) {
    const parts = toolNames.map((title) =>
      native_tool_parts.entry({
        callId: title,
        title,
        kind: "other",
        outcome: "succeeded",
      })
    );
    return renderToStaticMarkup(
      <ChatMessageView message={{ id: "reply", role: "assistant", parts }} />
    );
  }
});

describe("user message attachments", () => {
  it("keeps workflow references and model-only context out of authored prose", async () => {
    const context = workflowMessageContext([
      {
        number: 1,
        title: 'Pet & "friend" <draft>',
        showcaseUrl: "https://grida.co/fx/workflows/pet",
        sourceUrl: "https://github.com/gridaco/fx/tree/main/examples/pet",
        templateId: "pet",
        posterUrl: "https://fx-cdn.grida.co/showcase/artifacts/pet.webp",
      },
    ]);
    expect(context.modelText).toContain("<grida-desktop-context>");
    expect(context.modelText).toContain(
      'title="Pet &amp; &quot;friend&quot; &lt;draft&gt;" template-id="pet"'
    );
    expect(context.modelText).toContain("<reminder>");
    expect(context.modelText).not.toContain("pet.webp");

    const parts = native_message_parts.of({
      messageId: "ask",
      role: "user",
      text: "Only my prompt.",
      displayParts: context.displayParts,
    });
    const html = render(parts);
    const references = region(html, 'aria-label="Workflow references"');
    const prose = region(html, 'aria-label="Message text"');
    expect(references).toContain('href="https://grida.co/fx/workflows/pet"');
    expect(references).toContain("pet.webp");
    expect(prose).toContain("Only my prompt.");
    expect(prose).not.toContain("Pet");
    expect(html).not.toContain("Use Grida FX for this request");
    expect(html).not.toContain("github.com");
    const copy = vi.fn<(text: string) => Promise<void>>(async () => {});
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    vi.useFakeTimers();
    await actions
      .find(({ tooltip }) => tooltip === "Copy")
      ?.onClick?.({} as never);
    expect(copy).toHaveBeenCalledExactlyOnceWith("Only my prompt.");
    vi.unstubAllGlobals();

    const picksOnly = render(
      native_message_parts.of({
        messageId: "pick",
        role: "user",
        text: "",
        displayParts: context.displayParts,
      })
    );
    expect(region(picksOnly, 'aria-label="Message text"')).toBeNull();
    expect(
      region(picksOnly, 'aria-label="Workflow references"')
    ).not.toBeNull();
  });

  it("renders only recognized reference display versions and public showcase links", () => {
    const context = workflowMessageContext([]);
    expect(context.modelText).not.toContain("<references>");
    expect(context.displayParts).toEqual([]);

    const html = render([
      {
        type: chat_vocabulary.CONTEXT_PARTS.messageContext,
        data: [
          {
            kind: "fx.workflow-references",
            version: 2,
            data: {
              references: [
                {
                  number: 1,
                  title: "Future format",
                  showcaseUrl: "https://grida.co/fx/workflows/pet",
                },
              ],
            },
          },
          {
            kind: "fx.workflow-references",
            version: 1,
            data: {
              references: [
                {
                  number: 1,
                  title: "Unsafe reference",
                  showcaseUrl: "file:///private/secret",
                },
                {
                  number: 2,
                  title: "Valid reference",
                  showcaseUrl: "https://grida.co/fx/workflows/pet",
                  posterUrl: "https://example.org/untrusted.webp",
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(html).toContain("Valid reference");
    expect(html).not.toContain("Future format");
    expect(html).not.toContain("Unsafe reference");
    expect(html).not.toContain("untrusted.webp");
  });

  it("renders selected Library image references outside authored prose", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    const publicUrl = `https://library.grida.co/${"a".repeat(64)}.png`;
    const localUrl =
      "http://127.0.0.1:54321/storage/v1/object/public/library/example%20image.webp";
    const context = imagesMessageContext([
      { id: "first", title: 'Warm & "bright"', url: publicUrl },
      { id: "second", title: "Soft light", url: localUrl },
    ]);
    expect(context.modelText).toBe(
      [
        "<grida-desktop-context>",
        "  <images>",
        "    <references>",
        `      <reference title="Warm &amp; &quot;bright&quot;" url="${publicUrl}" />`,
        `      <reference title="Soft light" url="${localUrl}" />`,
        "    </references>",
        "    <reminder>Create an image for this request.</reminder>",
        "  </images>",
        "</grida-desktop-context>",
      ].join("\n")
    );
    const html = render(
      native_message_parts.of({
        messageId: "pick",
        role: "user",
        text: "Draw a fox.",
        displayParts: context.displayParts,
      })
    );
    const references = region(html, 'aria-label="Image references"');
    const prose = region(html, 'aria-label="Message text"');
    expect(references).toContain(`href="${publicUrl}"`);
    expect(references).toContain(`src="${publicUrl}"`);
    expect(references).toContain(`href="${localUrl}"`);
    expect(references).toContain(`src="${localUrl}"`);
    expect(references?.indexOf(publicUrl)).toBeLessThan(
      references?.indexOf(localUrl) ?? -1
    );
    expect(prose).toContain("Draw a fox.");
    expect(prose).not.toContain("Warm");
    expect(prose).not.toContain(publicUrl);
    expect(html).not.toContain("Create an image for this request.");

    const modeOnly = imagesMessageContext([]);
    expect(modeOnly.modelText).toContain("<images>");
    expect(modeOnly.modelText).not.toContain("<references>");
    expect(modeOnly.displayParts).toEqual([]);
  });

  it("ignores unknown Images display versions and URLs outside the Library", () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    vi.stubEnv(
      "NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN",
      "https://assets.example.test"
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const publicUrl = `https://assets.example.test/${"a".repeat(64)}.png`;
    const html = render([
      {
        type: chat_vocabulary.CONTEXT_PARTS.messageContext,
        data: [
          {
            ...IMAGE_REFERENCE_PART,
            version: 2,
            data: { references: [{ title: "Future image", url: publicUrl }] },
          },
          {
            ...IMAGE_REFERENCE_PART,
            data: {
              references: [
                { title: "Current image", url: publicUrl },
                { title: "Unsafe scheme", url: "javascript:alert(1)" },
                { title: "Offsite image", url: "https://evil.test/image.png" },
                {
                  title: "Private bucket",
                  url: "https://project.supabase.co/storage/v1/object/sign/library/private.png",
                },
                {
                  title: "Encoded separator",
                  url: "https://project.supabase.co/storage/v1/object/public/library/%2Fprivate.png",
                },
                {
                  title: "Signed URL",
                  url: `${publicUrl}?token=secret`,
                },
              ],
            },
          },
        ],
      },
    ]);
    const references = region(html, 'aria-label="Image references"');
    expect(references).toContain("Current image");
    expect(references?.match(/<img(?=\s)/g)).toHaveLength(1);
    expect(html).not.toContain("Future image");
    expect(html).not.toContain("Unsafe scheme");
    expect(html).not.toContain("Offsite image");
    expect(html).not.toContain("Private bucket");
    expect(html).not.toContain("Encoded separator");
    expect(html).not.toContain("Signed URL");
  });

  it("keeps different context parts in their supplied order", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const image = imagesMessageContext([
      {
        id: "image",
        title: "Palette reference",
        url: "https://project.supabase.co/storage/v1/object/public/library/palette.png",
      },
    ]);
    const template = slidesTemplateMessageContext({
      title: "Pitch deck",
      path: "pitch.canvas",
      slides: 6,
    });
    const html = render(
      native_message_parts.of({
        messageId: "ask",
        role: "user",
        text: "Make a proposal.",
        displayParts: [...image.displayParts, ...template.displayParts],
      })
    );
    const context = region(html, 'aria-label="Message context"');
    expect(context).toContain("Palette reference");
    expect(context).toContain("Pitch deck");
    expect(context?.indexOf("Palette reference")).toBeLessThan(
      context?.indexOf("Pitch deck") ?? -1
    );
  });

  it.each(["My bakery pitch.", ""])(
    "keeps the Slides template chip outside authored prose (%j)",
    (text) => {
      const context = slidesTemplateMessageContext({
        title: "Startup Pitch",
        slides: 12,
        path: "copied-private-path.canvas",
      });
      const html = render(
        native_message_parts.of({
          messageId: "ask",
          role: "user",
          text,
          displayParts: [
            ...context.displayParts,
            {
              ...SLIDES_TEMPLATE_PART,
              version: 2,
              data: { title: "Future Slides template" },
            },
          ],
        })
      );
      const templates = region(html, 'aria-label="Slides templates"');
      const prose = region(html, 'aria-label="Message text"');
      expect(templates).toContain("Startup Pitch");
      expect(prose === null).toBe(!text);
      expect(prose ?? "").toContain(text);
      expect(prose ?? "").not.toContain("Startup Pitch");
      expect(context.modelText).toContain("copied-private-path.canvas");
      expect(html).not.toContain("copied-private-path.canvas");
      expect(html).not.toContain("Edit that deck and keep its visual system");
      expect(html).not.toContain("Future Slides template");
    }
  );

  it("preserves every other admitted context marker as a chip outside the text bubble", () => {
    const markers = chat_vocabulary.CONTEXT_MARKERS as Record<string, string>;
    markers["data-related-material"] = "Related material";
    try {
      const context = {
        type: "data-related-material",
        data: { private: "do not include" },
      } as unknown as ChatMessage["parts"][number];
      const html = render([
        files([{ name: "first.txt" }]),
        context,
        files([{ name: "last.txt" }]),
        { type: "text", text: "My prose." },
      ]);
      const attachments = region(html, 'aria-label="Message attachments"')!;
      const text = region(html, 'aria-label="Message text"')!;
      expect(attachments).toContain("Related material");
      expect(attachments).not.toContain("do not include");
      expect(text).not.toContain("Related material");
      expect(attachments.indexOf("Related material")).toBeGreaterThan(
        attachments.indexOf("first.txt")
      );
      expect(attachments.indexOf("Related material")).toBeLessThan(
        attachments.indexOf("last.txt")
      );
      expect(html.indexOf(text)).toBeGreaterThan(
        html.indexOf(attachments) + attachments.length - 1
      );
    } finally {
      delete markers["data-related-material"];
    }
  });
  it("renders every resource outside the text bubble with useful supplied previews", () => {
    const html = render([
      files([
        { name: "clip.mov", poster: POSTER, caption: "0:13 · 1920×1080" },
        { name: "brief.pdf" },
        {
          name: "sources",
          kind: "directory",
          poster: POSTER,
          caption: "not a grant",
        },
      ]),
      {
        type: "file",
        filename: "sketch.png",
        mediaType: "image/png",
        url: "data:image/png;base64,iVBORw0KGgo=",
      },
      { type: "text", text: "Only my prompt." },
    ]);
    const attachments = region(html, 'aria-label="Message attachments"')!;
    const text = region(html, 'aria-label="Message text"')!;
    expect(attachments.match(/<li\b/g)).toHaveLength(4);
    expect(text).toContain("Only my prompt.");
    expect(text).not.toContain(attachments);
    expect(attachments).not.toContain(text);
    expect(html.indexOf(text)).toBeGreaterThan(
      html.indexOf(attachments) + attachments.length - 1
    );
    for (const name of ["clip.mov", "brief.pdf", "sources", "sketch.png"]) {
      expect(attachments).toContain(name);
      expect(text).not.toContain(name);
    }
    expect(attachments).not.toContain("3 files");
    expect(attachments).not.toContain("user_file_attachments");
    expect(attachments).not.toContain("read only");
    expect(attachments).not.toContain("not a grant");
    expect(attachments).toContain(`src="${POSTER}"`);
    expect(attachments).toContain("h-36 w-full");
    expect(attachments).toContain('title="Preview clip.mov"');
    expect(attachments).toContain('title="Preview sketch.png"');
    expect(attachments.match(/<img\b/g)).toHaveLength(2);
    expect(attachments).toContain("Folder");
  });

  it.each(["", "  \n  "])(
    "does not create an empty text bubble for an attachment-only message",
    (text) => {
      const html = render(
        [
          files([{ name: "sources", kind: "directory" }]),
          { type: "text", text },
        ],
        {
          sentAtMs: 1_700_000_000_000,
          note: "Queued",
          onEdit: vi.fn<(id: string) => void>(),
        }
      );
      expect(region(html, 'aria-label="Message text"')).toBeNull();
      expect(region(html, 'aria-label="Message attachments"')).toContain(
        "sources"
      );
      expect(actions.find(({ tooltip }) => tooltip === "Copy")).toBeUndefined();
      expect(
        actions.find(({ tooltip }) => tooltip === "Edit and resubmit")
      ).toBeUndefined();
      expect(html).toContain(
        `dateTime="${new Date(1_700_000_000_000).toISOString()}"`
      );
      expect(html).toContain("Queued");
    }
  );

  it("keeps long prose in the text-only collapsible region without hiding attachments with it", () => {
    const prose = "A long explanation. ".repeat(40);
    const html = render([
      files([{ name: "outside-bubble.mov", poster: POSTER }]),
      { type: "text", text: prose },
    ]);
    const attachments = region(html, 'aria-label="Message attachments"')!;
    const text = region(html, 'aria-label="Message text"')!;
    expect(text).toContain(prose.trim());
    expect(text).not.toContain("outside-bubble.mov");
    expect(text).not.toContain("<img");
    expect(text).toContain("relative flex flex-col gap-2");
    expect(attachments).not.toContain("overflow-hidden text-sm");
    expect(attachments).not.toContain("max-height");
    expect(attachments).toContain("<img");
  });

  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])(
    "renders a %s reference poster as only image pixels, without filename or dimensions",
    (mimeType) => {
      const html = render([
        files([
          {
            name: "photo.jpg",
            mimeType,
            poster: POSTER,
            caption: "320×240 · do not show",
          },
        ]),
      ]);
      const attachments = region(html, 'aria-label="Message attachments"')!;
      expect(attachments.replace(/<[^>]*>/g, "").trim()).toBe("");
      expect(attachments).toContain('alt="photo.jpg"');
      expect(attachments).toContain('title="Preview photo.jpg"');
      expect(attachments).toContain("h-auto w-auto");
      expect(attachments).toContain("max-h-64 max-w-52");
      expect(attachments).not.toContain("figcaption");
      expect(attachments).not.toContain("border bg-background");
      expect(attachments).not.toContain("320×240");
      expect(attachments).not.toContain("h-36");
    }
  );

  it("does not mistake a video poster for an image-only attachment", () => {
    const html = render([
      files([
        {
          name: "clip.mov",
          mimeType: "video/quicktime",
          poster: POSTER,
          caption: "0:13 · 1920×1080",
        },
      ]),
    ]);
    const attachments = region(html, 'aria-label="Message attachments"')!;
    expect(attachments).toContain("figcaption");
    expect(attachments).toContain("clip.mov");
    expect(attachments).toContain("0:13 · 1920×1080");
    expect(attachments).toContain("h-36 w-full");
  });

  it("keeps explicit image parts image-only and shows named fallbacks for unsafe sources", () => {
    const html = render([
      {
        type: "file",
        filename: "native.png",
        mediaType: "image/png",
        url: "data:image/png;base64,iVBORw0KGgo=",
      },
      {
        type: "file",
        filename: "private.png",
        mediaType: "image/png",
        url: "file:///private/denied.png",
      },
      {
        type: "file",
        filename: "custom.png",
        mediaType: "image/png",
        url: "javascript:alert(1)",
      },
    ]);
    const attachments = region(html, 'aria-label="Message attachments"')!;
    expect(attachments).toContain('alt="native.png"');
    expect(attachments).not.toContain(">native.png<");
    expect(attachments).toContain(">private.png<");
    expect(attachments).toContain(">custom.png<");
    expect(attachments).toContain("Preview unavailable");
    expect(attachments.match(/<img\b/g)).toHaveLength(1);
    expect(attachments).not.toContain("file:///private");
    expect(attachments).not.toContain("javascript:");
  });

  it("keeps retained image tokens outside markup and reads nothing during server rendering", () => {
    const load = vi.fn<(token: string) => Promise<Blob>>();
    const html = renderToStaticMarkup(
      <ChatMessageView
        message={{
          id: "png",
          role: "user",
          parts: [
            files([
              {
                name: "retained.png",
                mimeType: "image/png",
                previewId: "opaque-display-token",
              },
            ]),
          ],
        }}
        loadAttachmentPreview={load}
      />
    );
    expect(html).toContain('title="Preview retained.png"');
    expect(html).not.toContain("opaque-display-token");
    expect(html).not.toContain(">retained.png<");
    expect(load).not.toHaveBeenCalled();
  });

  it("copies only the exact prose and keeps edit, disabled state, time and notes intact", async () => {
    const copy = vi.fn<(text: string) => Promise<void>>(async () => {});
    const edit = vi.fn<(id: string) => void>();
    const parts: ChatMessage["parts"] = [
      files([{ name: "never-copy-this-file.mov", poster: POSTER }]),
      { type: "text", text: "First." },
      { type: "text", text: "\n\nSecond." },
    ];
    const html = render(parts, {
      onEdit: edit,
      disabled: true,
      note: "Sent with Plan",
      sentAtMs: 1_700_000_000_000,
    });
    const copyAction = actions.find(({ tooltip }) => tooltip === "Copy")!;
    expect(
      actions.find(({ tooltip }) => tooltip === "Edit and resubmit")?.disabled
    ).toBe(true);
    expect(copyAction.disabled).not.toBe(true);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    vi.useFakeTimers();
    await copyAction.onClick?.({} as never);
    expect(copy).toHaveBeenCalledExactlyOnceWith("First.\n\nSecond.");
    expect(edit).not.toHaveBeenCalled();
    expect(html).toContain("Sent with Plan");
    vi.clearAllTimers();
    actions.length = 0;
    render(parts, { onEdit: edit, disabled: false });
    actions
      .find(({ tooltip }) => tooltip === "Edit and resubmit")
      ?.onClick?.({} as never);
    expect(edit).toHaveBeenCalledExactlyOnceWith("ask");
  });

  it("ignores malformed metadata and never turns an arbitrary poster or token into a source", () => {
    const html = render([
      files([
        null,
        { name: 5 },
        { name: "" },
        {
          name: "external.png",
          poster: "https://example.test/private-image.png",
        },
        {
          name: "folder",
          kind: "directory",
          previewId: "opaque-not-a-path",
          mimeType: "image/png",
          poster: POSTER,
        },
        {
          name: "wrong-type.jpg",
          previewId: "opaque-not-a-path",
          mimeType: "image/jpeg",
        },
      ]),
    ]);
    const attachments = region(html, 'aria-label="Message attachments"')!;
    expect(attachments.match(/<li\b/g)).toHaveLength(3);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("https://example.test");
    expect(html).not.toContain("opaque-not-a-path");
    expect(region(html, 'aria-label="Message text"')).toBeNull();
  });
});
