import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageView } from "./message";
import { DesktopImagePolicy } from "@/lib/desktop/image-policy";
import { reply_images, ReplyImageSourceProvider } from "./reply-images";

const ROOT = "/Users/me/Grida Projects";
const CONTACT_SHEET = "Event Poster Kit.canvas/previews/contact-sheet.png";
const REFERENCE = encodeURI(CONTACT_SHEET);
const MEDIA_URL = `grida-workspace://workspace/current/${REFERENCE}`;
type Resolve = ReturnType<typeof reply_images.workspaceResolver>;

function render(
  text: string,
  resolve?: Resolve,
  role: "assistant" | "user" = "assistant",
  sources?: readonly string[]
) {
  const message = (
    <reply_images.Workspace value={resolve}>
      <ChatMessageView
        message={{ id: "reply", role, parts: [{ type: "text", text }] }}
      />
    </reply_images.Workspace>
  );
  return renderToStaticMarkup(
    sources ? (
      <ReplyImageSourceProvider sources={sources}>
        {message}
      </ReplyImageSourceProvider>
    ) : (
      message
    )
  );
}

describe("workspace reply images", () => {
  it.each([
    REFERENCE,
    `./${REFERENCE}`,
    `${encodeURI(ROOT)}/${REFERENCE}`,
    `file://${encodeURI(ROOT)}/${REFERENCE}`,
  ])("renders %s with current workspace media", (reference) => {
    const mediaUrl = vi.fn<Resolve>(() => MEDIA_URL);
    const html = render(
      `![Event posters](${reference})`,
      reply_images.workspaceResolver(ROOT, mediaUrl)
    );

    expect(mediaUrl).toHaveBeenCalledWith(CONTACT_SHEET);
    expect(html).toContain(`<img src="${MEDIA_URL}" alt="Event posters"`);
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it.each([
    "../secret.png",
    "%2e%2e/secret.png",
    "./%2e%2e%2fsecret.png",
    "%5csecret.png",
    "broken%ZZ.png",
    "/outside/poster.png",
    `file://${encodeURI(ROOT)}-other/poster.png`,
    `file://${encodeURI(ROOT)}/%2e%2e/poster.png`,
    `file://elsewhere${encodeURI(ROOT)}/poster.png`,
    "poster.svg",
  ])("keeps the caption for refused paths without reading %s", (reference) => {
    const mediaUrl = vi.fn<Resolve>();
    const html = render(
      `![Poster](${reference})`,
      reply_images.workspaceResolver(ROOT, mediaUrl)
    );

    expect(mediaUrl).not.toHaveBeenCalled();
    expect(html).toContain("Image unavailable: Poster");
    expect(html).not.toContain("<img");
  });

  it("blocks raw privileged media URLs", () => {
    const mediaUrl = vi.fn<Resolve>();
    const html = render(
      `![Other workspace](grida-workspace://workspace/other/cover.png)`,
      reply_images.workspaceResolver(ROOT, mediaUrl)
    );

    expect(mediaUrl).not.toHaveBeenCalled();
    expect(html).not.toContain('src="grida-workspace:');
  });

  it("keeps rendering the reply when raw image markup contains malformed Unicode", () => {
    const html = render(
      '<img src="poster\uD800.png" alt="Poster">',
      reply_images.workspaceResolver(ROOT, () => undefined)
    );
    expect(html).toContain("Image unavailable: Poster");
  });

  it("keeps the enclosing link as the action for a linked image", () => {
    const html = render(
      `[![Poster](${REFERENCE})](https://example.com/)`,
      reply_images.workspaceResolver(ROOT, () => MEDIA_URL)
    );
    expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com\/"/);
    expect(html).toContain(`<img src="${MEDIA_URL}" alt="Poster"`);
    expect(html).not.toContain('aria-haspopup="dialog"');
  });

  it("uses the fallback without a media URL and leaves ordinary rendering opt-in", () => {
    const markdown = `![Poster](${REFERENCE})`;
    const resolve = vi.fn<Resolve>();
    expect(render(markdown, resolve)).toContain("Image unavailable: Poster");
    expect(render(markdown)).toContain("[Image blocked: Poster]");
    resolve.mockClear();
    render(markdown, resolve, "user");
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("web reply images", () => {
  const sources = DesktopImagePolicy.sources("https://library.example.com");
  const renderImage = (url: string) =>
    render(`![Poster](${url})`, undefined, "assistant", sources);

  it.each([
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=800",
    "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
    "https://fx-cdn.grida.co/showcase/card.webp",
    "https://library.example.com/cover.png",
  ])("renders allowlisted %s without a referrer", (url) => {
    const html = renderImage(url);
    expect(html).toContain(`<img src="${url}" alt="Poster"`);
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });

  it.each([
    "https://example.com/cover.png",
    "https://images.unsplash.com.example.com/cover.png",
    "https://images.unsplash.com:8443/cover.png",
    "http://images.unsplash.com/cover.png",
    "https://fx-cdn.grida.co/other/card.webp",
  ])("offers an explicit link without loading %s", (url) => {
    const html = renderImage(url);
    expect(html).toContain("External image: Poster");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Open image</a>");
    expect(html).not.toContain("<img");
  });

  it("omits image data with URL credentials and strips alternate image sources", () => {
    expect(
      renderImage("https://user:password@images.unsplash.com/cover.png")
    ).not.toContain("user:password");
    const html = render(
      '<img alt="Poster" src="https://images.unsplash.com/cover.png" srcset="https://example.com/pixel.png">',
      undefined,
      "assistant",
      sources
    );
    expect(html).toContain('src="https://images.unsplash.com/cover.png"');
    expect(html).not.toContain("example.com/pixel.png");
  });

  it("keeps web images on other chat surfaces independent of the Desktop policy", () => {
    expect(render("![Poster](https://example.com/cover.png)")).toContain(
      'src="https://example.com/cover.png"'
    );
  });
});
