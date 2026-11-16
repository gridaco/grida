import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListEndIcon } from "lucide-react";
import { NativeQueuedMessagePreview } from "./native-queued-message-preview";

const poster =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/BsAAAAASUVORK5CYII=";
function firstSvgGlyph(html: string): string | undefined {
  return html.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
}
const queueGlyph = firstSvgGlyph(renderToStaticMarkup(<ListEndIcon />));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("queued message preview", () => {
  it("reads multiline text only when opened, coalesces reads and retains the full result", async () => {
    const pending = deferred<string>();
    const readText = vi
      .fn<() => Promise<string>>()
      .mockReturnValue(pending.promise);
    const preview = new NativeQueuedMessagePreview.Controller({
      preview: "First line…",
      readText,
    });
    const disconnect = preview.connect();
    expect(readText).not.toHaveBeenCalled();
    preview.setOpen(true);
    preview.setOpen(true);
    await vi.waitFor(() => expect(readText).toHaveBeenCalledOnce());
    expect(preview.read().loading).toBe(true);
    pending.resolve("First line\n\nSecond paragraph\nThird line");
    await vi.waitFor(() => expect(preview.read().loading).toBe(false));
    expect(preview.read().text).toBe(
      "First line\n\nSecond paragraph\nThird line"
    );
    preview.setOpen(false);
    preview.setOpen(true);
    expect(readText).toHaveBeenCalledOnce();
    disconnect();
  });

  it("keeps the bounded preview when full text becomes unavailable", async () => {
    const preview = new NativeQueuedMessagePreview.Controller({
      preview: "Saved preview…",
      readText: async () => {
        throw new Error("input claimed");
      },
    });
    const disconnect = preview.connect();
    preview.setOpen(true);
    await vi.waitFor(() => expect(preview.read().unavailable).toBe(true));
    expect(preview.read()).toMatchObject({
      text: "Saved preview…",
      loading: false,
    });
    disconnect();
  });

  it("does not publish a late read after the queued row has been replaced", async () => {
    const pending = deferred<string>();
    const preview = new NativeQueuedMessagePreview.Controller({
      preview: "Original",
      readText: () => pending.promise,
    });
    const disconnect = preview.connect();
    preview.setOpen(true);
    await Promise.resolve();
    disconnect();
    pending.resolve("Late text");
    await pending.promise;
    await Promise.resolve();
    expect(preview.read().text).toBe("Original");
  });

  it("identifies a plain text entry with the queue icon and its preview action", () => {
    const html = renderToStaticMarkup(
      <NativeQueuedMessagePreview
        inputId="text-input"
        preview="A queued follow-up"
      />
    );
    expect(queueGlyph).toBeDefined();
    expect(firstSvgGlyph(html)).toBe(queueGlyph);
    expect(html.match(/<svg\b/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Preview queued message"');
    expect(html).toContain("A queued follow-up");
    expect(html).not.toContain("<img");
  });

  it("keeps the queue icon before a safe attachment thumbnail and its label", () => {
    const html = renderToStaticMarkup(
      <NativeQueuedMessagePreview
        inputId="image-input"
        preview="Compare these shapes"
        attachments={[
          { name: "shapes.png", mimeType: "image/png", preview: { poster } },
        ]}
      />
    );
    expect(firstSvgGlyph(html)).toBe(queueGlyph);
    expect(html).toContain(`src="${poster}"`);
    expect(html).toContain('alt="shapes.png"');
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("<img"));
    expect(html.indexOf("<img")).toBeLessThan(
      html.indexOf("Compare these shapes")
    );
  });

  it("keeps the queue icon alongside the file fallback and queued text", () => {
    const html = renderToStaticMarkup(
      <NativeQueuedMessagePreview
        inputId="file-input"
        preview="Read the attached notes"
        attachments={[{ name: "notes.md", mimeType: "text/markdown" }]}
      />
    );
    expect(firstSvgGlyph(html)).toBe(queueGlyph);
    expect(html.match(/<svg\b/g)).toHaveLength(2);
    expect(html).toContain('aria-label="File attachment"');
    expect(html.indexOf('aria-label="File attachment"')).toBeLessThan(
      html.indexOf("Read the attached notes")
    );
    expect(html).not.toContain("<img");
  });

  it("never treats an attachment's remote URL as a display poster", () => {
    const html = renderToStaticMarkup(
      <NativeQueuedMessagePreview
        inputId="unavailable-image"
        preview={null}
        attachments={[
          {
            name: "photo.png",
            mimeType: "image/png",
            preview: { poster: "https://example.com/private.png" },
          },
        ]}
      />
    );
    expect(firstSvgGlyph(html)).toBe(queueGlyph);
    expect(html.match(/<svg\b/g)).toHaveLength(2);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("https://example.com");
    expect(html).toContain('aria-label="Image attachment"');
  });

  it("loads image bytes only through the supplied capability and renders a bounded still", async () => {
    const readImage = vi
      .fn<(id: string) => Promise<Blob>>()
      .mockResolvedValue(new Blob(["pixels"], { type: "image/png" }));
    const renderImage = vi
      .fn<(image: Blob, name: string) => Promise<string | undefined>>()
      .mockResolvedValue(poster);
    const preview = new NativeQueuedMessagePreview.Controller(
      {
        preview: "Image",
        image: {
          name: "photo.png",
          mimeType: "image/png",
          previewId: "opaque-preview",
        },
        readImage,
      },
      renderImage
    );
    const disconnect = preview.connect();
    await vi.waitFor(() => expect(preview.read().image).toBe(poster));
    expect(readImage).toHaveBeenCalledExactlyOnceWith("opaque-preview");
    expect(renderImage).toHaveBeenCalledOnce();
    disconnect();
  });

  it("does not decode an image whose authorized read completed after disposal", async () => {
    const pending = deferred<Blob>();
    const renderImage = vi
      .fn<(image: Blob, name: string) => Promise<string | undefined>>()
      .mockResolvedValue(poster);
    const preview = new NativeQueuedMessagePreview.Controller(
      {
        preview: "Image",
        image: {
          name: "photo.png",
          mimeType: "image/png",
          previewId: "opaque-preview",
        },
        readImage: () => pending.promise,
      },
      renderImage
    );
    const disconnect = preview.connect();
    await Promise.resolve();
    disconnect();
    pending.resolve(new Blob(["pixels"], { type: "image/png" }));
    await pending.promise;
    await Promise.resolve();
    expect(renderImage).not.toHaveBeenCalled();
    expect(preview.read().image).toBeNull();
  });

  it("preserves newlines and attachment names in the hover detail", () => {
    const html = renderToStaticMarkup(
      <NativeQueuedMessagePreview.Content
        text={"First line\n\nSecond paragraph"}
        attachments={[{ name: "photo.png", mimeType: "image/png" }]}
      />
    );
    expect(html).toContain("First line\n\nSecond paragraph");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("photo.png");
  });
});
