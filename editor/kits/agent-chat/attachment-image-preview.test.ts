import { describe, expect, it, vi } from "vitest";
import { AttachmentImagePreview } from "./attachment-image-preview";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  )
);

function fixture(loader: AttachmentImagePreview.Loader) {
  const visible: Array<() => void> = [];
  const display = {
    create: vi.fn<(blob: Blob) => string>(() => "blob:preview"),
    revoke: vi.fn<(url: string) => void>(),
    observe: vi.fn<(element: Element, callback: () => void) => () => void>(
      (_element, callback) => {
        visible.push(callback);
        return vi.fn<() => void>();
      }
    ),
  };
  const preview = new AttachmentImagePreview.Controller(
    "opaque-preview",
    loader,
    display
  );
  const connect = () => preview.connect({} as Element);
  return { preview, display, visible, connect };
}

describe("AttachmentImagePreview.Controller", () => {
  it.each([
    ["image/jpeg", [255, 216, 255, 224, 0, 2, 1, 2, 3, 4, 5, 6]],
    ["image/webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
    ["image/gif", [71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0]],
  ])(
    "displays a bounded retained %s original without relabelling its bytes as PNG",
    async (mime, bytes) => {
      const image = new Blob([Uint8Array.from(bytes)], { type: mime });
      const { preview, display, connect } = fixture(async () => image);
      const disconnect = connect();
      try {
        await expect(preview.load()).resolves.toBe(image);
        expect(display.create).toHaveBeenCalledExactlyOnceWith(image);
      } finally {
        disconnect();
      }
    }
  );
  it("does not start a read if the attachment closes before dispatch", async () => {
    const load = vi.fn<AttachmentImagePreview.Loader>();
    const { preview, connect } = fixture(load);
    const disconnect = connect();
    const pending = preview.load();
    disconnect();
    await expect(pending).rejects.toThrow("attachment_preview_unavailable");
    expect(load).not.toHaveBeenCalled();
  });
  it("waits for visibility, deduplicates thumbnail/fullscreen reads and releases its display URL", async () => {
    const image = new Blob([PNG], { type: "image/png" });
    const pending = Promise.withResolvers<Blob>();
    const load = vi.fn<AttachmentImagePreview.Loader>(() => pending.promise);
    const { preview, display, visible, connect } = fixture(load);
    const disconnect = connect();
    expect(preview.read()).toEqual({ source: null, status: "idle" });
    expect(load).not.toHaveBeenCalled();
    visible[0]();
    const fullscreen = preview.load();
    expect(preview.load()).toBe(fullscreen);
    pending.resolve(image);
    await expect(fullscreen).resolves.toBe(image);
    expect(load).toHaveBeenCalledExactlyOnceWith("opaque-preview");
    expect(display.create).toHaveBeenCalledExactlyOnceWith(image);
    expect(preview.read()).toEqual({ source: "blob:preview", status: "ready" });
    await expect(preview.load()).resolves.toBe(image);
    expect(load).toHaveBeenCalledTimes(1);
    disconnect();
    disconnect();
    expect(display.revoke).toHaveBeenCalledExactlyOnceWith("blob:preview");
    await expect(preview.load()).rejects.toThrow(
      "attachment_preview_unavailable"
    );
  });

  it.each([
    new Blob([PNG], { type: "image/jpeg" }),
    new Blob(["not a PNG"], { type: "image/png" }),
    new Blob([], { type: "image/png" }),
    new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: "image/png" }),
  ])(
    "refuses an unsupported, corrupt, empty or oversized retained preview",
    async (image) => {
      const { preview, display, connect } = fixture(async () => image);
      const disconnect = connect();
      try {
        await expect(preview.load()).rejects.toThrow(
          "attachment_preview_unavailable"
        );
        expect(preview.read()).toEqual({ source: null, status: "unavailable" });
        expect(display.create).not.toHaveBeenCalled();
      } finally {
        disconnect();
      }
    }
  );

  it("ignores late bytes and visibility callbacks after replacement and permits an explicit retry", async () => {
    const old = Promise.withResolvers<Blob>();
    const image = new Blob([PNG], { type: "image/png" });
    const load = vi.fn<AttachmentImagePreview.Loader>();
    load
      .mockReturnValueOnce(old.promise)
      .mockRejectedValueOnce(new Error("private native failure"))
      .mockResolvedValueOnce(image);
    const { preview, display, visible, connect } = fixture(load);
    const first = connect();
    const pending = preview.load();
    await Promise.resolve();
    first();
    const second = connect();
    try {
      visible[0]();
      expect(load).toHaveBeenCalledTimes(1);
      old.resolve(image);
      await expect(pending).rejects.toThrow("attachment_preview_unavailable");
      expect(display.create).not.toHaveBeenCalled();
      expect(preview.read()).toEqual({ source: null, status: "idle" });
      await expect(preview.load()).rejects.toThrow(
        "attachment_preview_unavailable"
      );
      expect(preview.read().status).toBe("unavailable");
      await expect(preview.load()).resolves.toBe(image);
      expect(load).toHaveBeenCalledTimes(3);
      expect(preview.read().status).toBe("ready");
    } finally {
      second();
    }
  });

  it("rejects a compressed image whose pixel dimensions exceed the display bound", async () => {
    const bytes = Uint8Array.from(PNG);
    const dimensions = new DataView(bytes.buffer);
    dimensions.setUint32(16, 9000);
    dimensions.setUint32(20, 9000);
    const { preview, display, connect } = fixture(
      async () => new Blob([bytes], { type: "image/png" })
    );
    const disconnect = connect();
    try {
      await expect(preview.load()).rejects.toThrow(
        "attachment_preview_unavailable"
      );
      expect(display.create).not.toHaveBeenCalled();
    } finally {
      disconnect();
    }
  });

  it("falls back after a display decode failure without retiring a replacement image", async () => {
    const image = new Blob([PNG], { type: "image/png" });
    const { preview, display, connect } = fixture(async () => image);
    display.create
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const disconnect = connect();
    try {
      await preview.load();
      preview.failed("blob:first");
      expect(preview.read().status).toBe("unavailable");
      expect(display.revoke).toHaveBeenCalledExactlyOnceWith("blob:first");
      await preview.load();
      preview.failed("blob:first");
      expect(preview.read()).toEqual({
        source: "blob:second",
        status: "ready",
      });
      expect(display.revoke).toHaveBeenCalledTimes(1);
    } finally {
      disconnect();
    }
    expect(display.revoke).toHaveBeenLastCalledWith("blob:second");
  });
});
