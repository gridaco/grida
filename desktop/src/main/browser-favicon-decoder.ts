/** GRIDA-SEC-016 — untrusted images decode only in an image-only sandbox. */
import { WebContentsView } from "electron";
import { DesktopBrowser, type WebPreview } from "@grida/desktop-bridge";

const page =
  "data:text/html;charset=utf-8," +
  encodeURIComponent(
    '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">'
  );

// Executed in the dedicated sandbox. This function must be self-contained.
async function rasterize(
  source: string,
  bannerEdge: number,
  sourceEdge: number
): Promise<string> {
  const icon = bannerEdge === 0;
  const image = new Image(32, 32);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("invalid preview image"));
    image.src = source;
  });
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height || width > sourceEdge || height > sourceEdge)
    throw new Error("invalid preview image dimensions");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  if (!icon) {
    const scale = Math.min(1, bannerEdge / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }
  canvas.width = canvas.height = 32;
  const scale = Math.min(32 / width, 32 / height);
  const w = width * scale;
  const h = height * scale;
  context.drawImage(image, (32 - w) / 2, (32 - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

export class BrowserFaviconDecoder {
  #renderer: { view: WebContentsView; ready: Promise<void> } | null = null;
  #tail = Promise.resolve();

  decode = (
    source: string,
    signal: AbortSignal
  ): Promise<DesktopBrowser.Favicon | null> => {
    return this.#queue(source, signal, 0).then((dataUrl) =>
      DesktopBrowser.parseFavicon({ dataUrl })
    );
  };

  decodeLinkImage = (
    source: string,
    signal: AbortSignal
  ): Promise<WebPreview.LinkImage | null> => {
    return this.#queue(source, signal, DesktopBrowser.MAX_LINK_IMAGE_EDGE).then(
      (dataUrl) => DesktopBrowser.parseLinkImage({ dataUrl })
    );
  };

  #queue(source: string, signal: AbortSignal, bannerEdge: number) {
    const task = this.#tail.then(() =>
      this.#decode(source, signal, bannerEdge)
    );
    this.#tail = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  close(): void {
    const contents = this.#renderer?.view.webContents;
    this.#renderer = null;
    if (contents && !contents.isDestroyed())
      contents.close({ waitForBeforeUnload: false });
  }

  async #decode(
    source: string,
    signal: AbortSignal,
    bannerEdge: number
  ): Promise<unknown> {
    if (signal.aborted) return null;
    if (!this.#renderer || this.#renderer.view.webContents.isDestroyed()) {
      const view = new WebContentsView({
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          partition: "grida-icon-decoder",
        },
      });
      const contents = view.webContents;
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      contents.on("will-navigate", (event) => event.preventDefault());
      this.#renderer = { view, ready: contents.loadURL(page) };
    }

    const { view, ready } = this.#renderer;
    const contents = view.webContents;
    let release!: () => void;
    const canceled = new Promise<null>((resolve) => {
      release = () => resolve(null);
    });
    const abort = () => {
      release();
      this.close();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      // Closing a WebContents can leave its pending executeJavaScript unsettled.
      const dataUrl: unknown = await Promise.race([
        canceled,
        ready.then(() =>
          signal.aborted
            ? null
            : contents.executeJavaScript(
                `(${rasterize.toString()})(${JSON.stringify(source)}, ${bannerEdge}, ${bannerEdge ? DesktopBrowser.MAX_LINK_IMAGE_SOURCE_EDGE : 1024})`
              )
        ),
      ]);
      return signal.aborted ? null : dataUrl;
    } catch {
      if (
        !signal.aborted &&
        (contents.isDestroyed() || contents.getURL() !== page)
      )
        this.close();
      return null;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
}
