import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatTabPreview } from "./chat-tab-preview";
import {
  ChatTabPreviewContent,
  EditorTabChatPreview,
} from "./editor-tab-chat-preview";

describe("chat tab preview", () => {
  it("labels excerpts accessibly and renders plain inert text without starting or inspecting a chat", () => {
    const read = vi.fn<ChatTabPreview.Source["read"]>(() => ({
      messages: [
        {
          role: "user" as const,
          text: "**Check** [this layout](https://example.test) <img src=x>",
        },
        { role: "assistant" as const, text: "<script>output</script>" },
      ],
    }));
    const subscribe = vi.fn<ChatTabPreview.Source["subscribe"]>(() => () => {});
    const html = renderToStaticMarkup(
      <EditorTabChatPreview
        title="Layout review"
        source={{ read, subscribe }}
      />
    );
    expect(read).toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(html).toContain("Layout review");
    expect(html).not.toContain(">You</p>");
    expect(html).not.toContain(">Grida</p>");
    expect(html).toContain('role="group" aria-label="You"');
    expect(html).toContain('role="group" aria-label="Grida"');
    expect(html).toContain("Check this layout &lt;img src=x&gt;");
    expect(html).not.toContain("**Check**");
    expect(html).not.toContain("https://example.test");
    expect(html).toContain("&lt;script&gt;output&lt;/script&gt;");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<strong");
    expect(html).not.toContain("<script");
  });

  it("keeps only the latest user and assistant excerpts in their transcript order", () => {
    const html = renderToStaticMarkup(
      <ChatTabPreviewContent
        title="Layout review"
        messages={[
          { role: "user", text: "An older request" },
          { role: "assistant", text: "The layout is ready." },
          { role: "user", text: "Can you adjust the spacing?" },
        ]}
      />
    );
    expect(html).not.toContain("An older request");
    expect(html).toContain("The layout is ready.");
    expect(html).toContain("Can you adjust the spacing?");
    expect(html.indexOf('aria-label="Grida"')).toBeLessThan(
      html.indexOf('aria-label="You"')
    );
  });

  it("shows an attachment-only user message by its filename without loading a preview", () => {
    const html = renderToStaticMarkup(
      <ChatTabPreviewContent
        title="Image reference"
        messages={[
          { role: "user", text: "", attachments: [{ name: "reference.jpg" }] },
        ]}
      />
    );
    expect(html).toContain('role="group" aria-label="You"');
    expect(html).toContain("reference.jpg");
    expect(html).not.toContain("No messages yet");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
  });

  it("shows an honest empty state before the first message", () => {
    const html = renderToStaticMarkup(
      <ChatTabPreviewContent title="Side chat" messages={[]} />
    );
    expect(html).toContain("No messages yet");
  });
});
