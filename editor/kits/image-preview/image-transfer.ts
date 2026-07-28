const IMAGE_EXTENSION: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/** Transfers one source image out of the app without involving its viewport. */
export class ImageTransfer {
  constructor(
    private readonly src: string,
    private readonly suggestedName?: string
  ) {}

  async copyToClipboard(): Promise<void> {
    const blob = await this.pngBlob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  }

  async download(): Promise<void> {
    const blob = await this.sourceBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = this.filename(blob.type);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private async sourceBlob(): Promise<Blob> {
    const response = await fetch(this.src);
    if (!response.ok) throw new Error("Couldn't load image");
    return response.blob();
  }

  private async pngBlob(): Promise<Blob> {
    const source = await this.sourceBlob();
    if (source.type === "image/png") return source;
    const bitmap = await createImageBitmap(source);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Couldn't prepare image");
      context.drawImage(bitmap, 0, 0);
      const png = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!png) throw new Error("Couldn't prepare image");
      return png;
    } finally {
      bitmap.close();
    }
  }

  private filename(mime: string): string {
    const extension = IMAGE_EXTENSION[mime] ?? "png";
    const basename = this.suggestedName?.split(/[\\/]/).pop()?.split(/[?#]/)[0];
    const stem = basename
      ?.replace(/\.[^.]+$/, "")
      .replace(/[<>:"/\\|?*]/g, "-")
      .trim()
      .slice(0, 80);
    return `${stem || "image"}.${extension}`;
  }
}
