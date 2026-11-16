import { describe, expect, it, vi } from "vitest";
import { image_attachment_preview } from "./image-attachment-preview";
import { video_attachment } from "./video-attachment";

const POSTER = "data:image/png;base64,iVBORw0KGgo=";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const LARGE = `data:image/png;base64,${"A".repeat(video_attachment.MAX_POSTER_BYTES)}`;
const SIGNATURES: Record<string, number[]> = {
  "image/png": [137, 80, 78, 71, 13, 10, 26, 10],
  "image/jpeg": [255, 216, 255],
  "image/gif": [71, 73, 70, 56, 57, 97],
  "image/webp": [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80],
};

function file(mime = "image/png", name = "photo.png") {
  return new File([Uint8Array.from(SIGNATURES[mime])], name, { type: mime });
}

function resources(width = 1920, height = 1080, posters = [POSTER]) {
  const bitmap = { width, height, close: vi.fn<() => void>() };
  const decode = vi.fn<(file: File) => Promise<typeof bitmap>>(
    async () => bitmap
  );
  const drawn: { width: number; height: number }[] = [];
  const encoded: string[] = [];
  const closed: ReturnType<typeof vi.fn>[] = [];
  const media: image_attachment_preview.Media = {
    decode,
    canvas: () => {
      const close = vi.fn<() => void>();
      closed.push(close);
      return {
        draw: (_source, w, h) => drawn.push({ width: w, height: h }),
        toDataURL: (type) => {
          const poster = posters[Math.min(encoded.length, posters.length - 1)];
          encoded.push(type);
          return poster;
        },
        close,
      };
    },
  };
  return { bitmap, decode, media, drawn, encoded, closed };
}

describe("image_attachment_preview.mediaType", () => {
  it.each([
    ["PHOTO.PNG", "image/png"],
    ["PHOTO.JPEG", "image/jpeg"],
    ["PHOTO.WEBP", "image/webp"],
    ["PHOTO.GIF", "image/gif"],
  ] as const)("classifies empty-MIME %s references as %s", (name, expected) => {
    expect(image_attachment_preview.mediaType({ name, type: "" })).toBe(
      expected
    );
  });

  it("keeps an explicit non-raster MIME out of extension fallback", () => {
    expect(
      image_attachment_preview.mediaType({
        name: "photo.png",
        type: "application/octet-stream",
      })
    ).toBeUndefined();
    expect(
      image_attachment_preview.mediaType({ name: "photo", type: "IMAGE/PNG" })
    ).toBe("image/png");
  });

  it("refuses forbidden names even when their MIME claims a raster", () => {
    for (const name of [
      "art.svg",
      "art.svgz",
      "page.html",
      "page.htm",
      "paper.pdf",
    ])
      expect(
        image_attachment_preview.mediaType({ name, type: "image/png" })
      ).toBeUndefined();
  });
});

describe("image_attachment_preview.probe", () => {
  it("previews the original selected File with truthful source dimensions and releases decode resources", async () => {
    const source = file();
    const fixture = resources();
    expect(await image_attachment_preview.probe(source, fixture.media)).toEqual(
      {
        poster: POSTER,
        width: 1920,
        height: 1080,
      }
    );
    expect(fixture.decode).toHaveBeenCalledExactlyOnceWith(source);
    expect(fixture.drawn).toEqual([{ width: 320, height: 180 }]);
    expect(fixture.bitmap.close).toHaveBeenCalledOnce();
    expect(fixture.closed[0]).toHaveBeenCalledOnce();
  });

  it.each([
    ["image/png", "photo.png"],
    ["image/jpeg", "photo.jpg"],
    ["image/webp", "photo.webp"],
    ["image/gif", "photo.gif"],
  ])("accepts a bounded %s raster", async (mime, name) => {
    const fixture = resources(24, 12);
    expect(
      await image_attachment_preview.probe(file(mime, name), fixture.media)
    ).toEqual({ poster: POSTER, width: 24, height: 12 });
    expect(fixture.drawn).toEqual([{ width: 24, height: 12 }]);
    expect(fixture.bitmap.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["image/png", "PHOTO.PNG"],
    ["image/jpeg", "PHOTO.JPG"],
    ["image/webp", "PHOTO.WEBP"],
    ["image/gif", "PHOTO.GIF"],
  ])(
    "uses the %s signature and extension when the File has no MIME type",
    async (mime, name) => {
      const source = new File([Uint8Array.from(SIGNATURES[mime])], name);
      expect(
        await image_attachment_preview.probe(source, resources().media)
      ).toMatchObject({ poster: POSTER });
    }
  );

  it.each([
    ["text/html", "page.html"],
    ["image/svg+xml", "art.svg"],
    ["application/pdf", "paper.pdf"],
    ["inode/directory", "folder"],
    ["image/avif", "photo.avif"],
    ["application/octet-stream", "photo.png"],
    ["image/png", "art.svg"],
    ["image/png", "page.html"],
    ["image/png", "paper.pdf"],
    ["", "unknown"],
  ])("refuses %s / %s before decode", async (type, name) => {
    const fixture = resources();
    const source = new File([Uint8Array.from(SIGNATURES["image/png"])], name, {
      type,
    });
    expect(
      await image_attachment_preview.probe(source, fixture.media)
    ).toBeUndefined();
    expect(fixture.decode).not.toHaveBeenCalled();
    expect(fixture.closed).toEqual([]);
  });

  it("refuses spoofed raster labels and mismatched signatures before decode", async () => {
    const fixture = resources();
    for (const body of [
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
      "%PDF-1.7",
      "<html/>",
    ])
      expect(
        await image_attachment_preview.probe(
          new File([body], "photo.png", { type: "image/png" }),
          fixture.media
        )
      ).toBeUndefined();
    expect(
      await image_attachment_preview.probe(file("image/jpeg", "photo.png"), {
        ...fixture.media,
        decode: fixture.decode,
      })
    ).toMatchObject({ poster: POSTER });
    const mismatched = new File(
      [Uint8Array.from(SIGNATURES["image/jpeg"])],
      "photo.png",
      { type: "image/png" }
    );
    fixture.decode.mockClear();
    expect(
      await image_attachment_preview.probe(mismatched, fixture.media)
    ).toBeUndefined();
    expect(fixture.decode).not.toHaveBeenCalled();
  });

  it("admits at most 4 MiB and rejects empty sources before decode", async () => {
    const fixture = resources();
    const source = new Uint8Array(image_attachment_preview.MAX_SOURCE_BYTES);
    source.set(SIGNATURES["image/png"]);
    expect(
      await image_attachment_preview.probe(
        new File([source], "photo.png", { type: "image/png" }),
        fixture.media
      )
    ).toMatchObject({ poster: POSTER });
    fixture.decode.mockClear();
    for (const bytes of [new Uint8Array(), new Uint8Array(source.length + 1)])
      expect(
        await image_attachment_preview.probe(
          new File([bytes], "photo.png", { type: "image/png" }),
          fixture.media
        )
      ).toBeUndefined();
    expect(fixture.decode).not.toHaveBeenCalled();
  });

  it.each([
    [0, 10],
    [10, 0],
    [Number.NaN, 10],
    [Number.POSITIVE_INFINITY, 10],
    [1.5, 10],
    [4096, 4097],
    [video_attachment.MAX_DIMENSION + 1, 1],
  ])(
    "refuses decoded dimensions %s × %s and closes the bitmap",
    async (width, height) => {
      const fixture = resources(width, height);
      expect(
        await image_attachment_preview.probe(file(), fixture.media)
      ).toBeUndefined();
      expect(fixture.bitmap.close).toHaveBeenCalledOnce();
      expect(fixture.drawn).toEqual([]);
    }
  );

  it("admits exactly the 16 Mi-pixel decoded budget", async () => {
    const fixture = resources(4096, 4096);
    expect(await image_attachment_preview.probe(file(), fixture.media)).toEqual(
      { poster: POSTER, width: 4096, height: 4096 }
    );
    expect(fixture.drawn).toEqual([{ width: 320, height: 320 }]);
  });

  it("tries JPEG and then a smaller still when the first encodings exceed the retained poster budget", async () => {
    const jpeg = resources(640, 480, [LARGE, JPEG]);
    expect(
      await image_attachment_preview.probe(file(), jpeg.media)
    ).toMatchObject({ poster: JPEG });
    expect(jpeg.encoded).toEqual(["image/png", "image/jpeg"]);
    const smaller = resources(640, 480, [LARGE, LARGE, POSTER]);
    expect(
      await image_attachment_preview.probe(file(), smaller.media)
    ).toMatchObject({ poster: POSTER });
    expect(smaller.drawn).toEqual([
      { width: 320, height: 240 },
      { width: 160, height: 120 },
    ]);
    expect(smaller.closed).toHaveLength(2);
    for (const close of smaller.closed) expect(close).toHaveBeenCalledOnce();
    expect(smaller.bitmap.close).toHaveBeenCalledOnce();
  });

  it.each([
    LARGE,
    "data:image/svg+xml;base64,PHN2Zy8+",
    "https://example.com/photo.png",
    "data:image/png;base64,!",
  ])(
    "keeps no preview for an oversized or invalid encoded poster",
    async (poster) => {
      const fixture = resources(640, 480, [poster]);
      expect(
        await image_attachment_preview.probe(file(), fixture.media)
      ).toBeUndefined();
      expect(fixture.bitmap.close).toHaveBeenCalledOnce();
      for (const close of fixture.closed) expect(close).toHaveBeenCalledOnce();
    }
  );

  it("returns unavailable for failed decoding, absent canvas and failed drawing", async () => {
    const failed = resources();
    failed.decode.mockRejectedValueOnce(new Error("decode_failed"));
    expect(
      await image_attachment_preview.probe(file(), failed.media)
    ).toBeUndefined();
    expect(failed.bitmap.close).not.toHaveBeenCalled();
    const absent = resources();
    expect(
      await image_attachment_preview.probe(file(), {
        ...absent.media,
        canvas: () => null,
      })
    ).toBeUndefined();
    expect(absent.bitmap.close).toHaveBeenCalledOnce();
    const broken = resources();
    const close = vi.fn<() => void>();
    expect(
      await image_attachment_preview.probe(file(), {
        ...broken.media,
        canvas: () => ({
          draw: () => {
            throw new Error("draw_failed");
          },
          toDataURL: () => POSTER,
          close,
        }),
      })
    ).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
    expect(broken.bitmap.close).toHaveBeenCalledOnce();
  });

  it("times out without publishing a late bitmap and closes it when decoding eventually finishes", async () => {
    vi.useFakeTimers();
    try {
      const fixture = resources();
      let release!: (value: typeof fixture.bitmap) => void;
      let started!: () => void;
      const decoding = new Promise<typeof fixture.bitmap>((resolve) => {
        release = resolve;
      });
      const observed = new Promise<void>((resolve) => {
        started = resolve;
      });
      fixture.decode.mockImplementation(() => {
        started();
        return decoding;
      });
      const preview = image_attachment_preview.probe(file(), fixture.media);
      await observed;
      await vi.advanceTimersByTimeAsync(image_attachment_preview.TIMEOUT_MS);
      expect(await preview).toBeUndefined();
      expect(fixture.bitmap.close).not.toHaveBeenCalled();
      release(fixture.bitmap);
      await decoding;
      expect(fixture.bitmap.close).toHaveBeenCalledOnce();
      expect(fixture.drawn).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes signature reading in the timeout and does not start a late decode", async () => {
    vi.useFakeTimers();
    try {
      const fixture = resources();
      const source = file();
      const header = new Blob();
      let release!: (value: ArrayBuffer) => void;
      const reading = new Promise<ArrayBuffer>((resolve) => {
        release = resolve;
      });
      vi.spyOn(header, "arrayBuffer").mockReturnValue(reading);
      vi.spyOn(source, "slice").mockReturnValue(header);
      const preview = image_attachment_preview.probe(source, fixture.media);
      await vi.advanceTimersByTimeAsync(image_attachment_preview.TIMEOUT_MS);
      expect(await preview).toBeUndefined();
      release(Uint8Array.from(SIGNATURES["image/png"]).buffer);
      await reading;
      expect(fixture.decode).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes both resources when encoding throws", async () => {
    const fixture = resources();
    const close = vi.fn<() => void>();
    expect(
      await image_attachment_preview.probe(file(), {
        ...fixture.media,
        canvas: () => ({
          draw: () => {},
          toDataURL: () => {
            throw new Error("encode_failed");
          },
          close,
        }),
      })
    ).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
    expect(fixture.bitmap.close).toHaveBeenCalledOnce();
  });

  it("does not publish a synchronous encoding result after the deadline", async () => {
    vi.useFakeTimers();
    try {
      const fixture = resources();
      const close = vi.fn<() => void>();
      expect(
        await image_attachment_preview.probe(file(), {
          ...fixture.media,
          canvas: () => ({
            draw: () => {},
            toDataURL: () => {
              vi.setSystemTime(
                Date.now() + image_attachment_preview.TIMEOUT_MS
              );
              return POSTER;
            },
            close,
          }),
        })
      ).toBeUndefined();
      expect(close).toHaveBeenCalledOnce();
      expect(fixture.bitmap.close).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
