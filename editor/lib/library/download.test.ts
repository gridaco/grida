import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryDownload } from "./download";

const saveBlob = vi.hoisted(() =>
  vi.fn<(blob: Blob, filename: string, options: { autoBom: boolean }) => void>()
);
vi.mock("file-saver", () => ({ saveAs: saveBlob }));

const digest = "a".repeat(64);
const fetchImage = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchImage);
});

afterEach(() => vi.unstubAllGlobals());

describe("LibraryDownload", () => {
  it.each([
    ["jpg", "image/jpeg"],
    ["svg", "image/svg+xml"],
  ])(
    "saves the original %s bytes with the hash filename",
    async (ext, mime) => {
      const bytes = new Uint8Array([0, 255, 2, 128]);
      const blob = new Blob([bytes], { type: mime });
      fetchImage.mockResolvedValue({
        ok: true,
        blob: async () => blob,
      } as Response);
      const href = `https://library.grida.co/${digest}.${ext}`;

      await LibraryDownload.save(href);

      expect(fetchImage).toHaveBeenCalledExactlyOnceWith(href, {
        credentials: "omit",
      });
      expect(saveBlob).toHaveBeenCalledExactlyOnceWith(
        blob,
        `${digest}.${ext}`,
        {
          autoBom: false,
        }
      );
      const savedBlob = saveBlob.mock.calls[0][0];
      expect(savedBlob).toBe(blob);
      expect(new Uint8Array(await savedBlob.arrayBuffer())).toEqual(bytes);
    }
  );

  it("does not save an HTTP error response as an image", async () => {
    const readBlob = vi.fn<() => Promise<Blob>>();
    fetchImage.mockResolvedValue({
      ok: false,
      blob: readBlob,
    } as unknown as Response);

    await expect(
      LibraryDownload.save(`https://library.grida.co/${digest}.png`)
    ).rejects.toThrow("Couldn't load Library image");

    expect(readBlob).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("leaves a failed fetch retryable without starting a download", async () => {
    fetchImage.mockRejectedValue(new TypeError("Network request failed"));

    await expect(
      LibraryDownload.save(`https://library.grida.co/${digest}.png`)
    ).rejects.toThrow("Network request failed");

    expect(saveBlob).not.toHaveBeenCalled();
  });
});
