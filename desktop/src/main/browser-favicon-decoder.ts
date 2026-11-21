/** GRIDA-SEC-016 — untrusted icons decode only in an image-only sandbox. */
import { WebContentsView } from "electron";
import { DesktopBrowser } from "@grida/desktop-bridge";

const page =
  "data:text/html;charset=utf-8," +
  encodeURIComponent(
    '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">'
  );

// Executed in the dedicated sandbox. This function must be self-contained.
async function rasterize(source: string): Promise<string> {
  const image = new Image(32, 32);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("invalid icon"));
    image.src = source;
  });
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height || width > 1024 || height > 1024)
    throw new Error("invalid icon dimensions");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const scale = Math.min(32 / width, 32 / height);
  const w = width * scale;
  const h = height * scale;
  canvas.getContext("2d")!.drawImage(image, (32 - w) / 2, (32 - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

export class BrowserFaviconDecoder {
  #renderer: { view: WebContentsView; ready: Promise<void> } | null = null;
  #tail = Promise.resolve();

  decode = (
    source: string,
    signal: AbortSignal
  ): Promise<DesktopBrowser.Favicon | null> => {
    const task = this.#tail.then(() => this.#decode(source, signal));
    this.#tail = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  };

  close(): void {
    const contents = this.#renderer?.view.webContents;
    this.#renderer = null;
    if (contents && !contents.isDestroyed())
      contents.close({ waitForBeforeUnload: false });
  }

  async #decode(
    source: string,
    signal: AbortSignal
  ): Promise<DesktopBrowser.Favicon | null> {
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
                `(${rasterize.toString()})(${JSON.stringify(source)})`
              )
        ),
      ]);
      return signal.aborted ? null : DesktopBrowser.parseFavicon({ dataUrl });
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
