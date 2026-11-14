import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_ATTACHMENT_POLICY,
  decodedBytes,
  encodeLibraryPng,
  isSupportedImageType,
  planResize,
} from "./image-attachment";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("normalizes captured WebP bytes into a bounded PNG without opening an image URL", async () => {
  const input = Uint8Array.of(1, 2, 3);
  const output = Uint8Array.of(137, 80, 78, 71);
  const close = vi.fn<() => void>();
  const drawImage = vi.fn<CanvasRenderingContext2D["drawImage"]>();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toDataURL: (mime: string) => {
      expect(mime).toBe("image/png");
      const bytes = canvas.width > 240 ? new Uint8Array(32) : output;
      return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
    },
  };
  const decode = vi.fn<(source: Blob) => Promise<unknown>>(async (source) => {
    expect(source.type).toBe("image/webp");
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(input);
    return { width: 1000, height: 500, close };
  });
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        throw new Error("Unexpected remote image materialization");
      }
    }
  );

  const png = await encodeLibraryPng(
    { mime: "image/webp", bytes: input.buffer },
    16
  );
  expect(new Uint8Array(png)).toEqual(output);
  expect(decode).toHaveBeenCalledOnce();
  expect(drawImage.mock.calls.map((call) => call.slice(3))).toEqual([
    [768, 384],
    [240, 120],
  ]);
  expect(close).toHaveBeenCalledOnce();
});

describe("planResize", () => {
  it("keeps dimensions already within the longest-edge budget", () => {
    expect(planResize(100, 50, 1568)).toEqual({ width: 100, height: 50 });
    expect(planResize(1568, 1000, 1568)).toEqual({ width: 1568, height: 1000 });
  });

  it("scales the longest edge down to maxEdge, preserving aspect ratio", () => {
    expect(planResize(3000, 1500, 1568)).toEqual({ width: 1568, height: 784 });
    expect(planResize(1500, 3000, 1568)).toEqual({ width: 784, height: 1568 });
  });

  it("handles squares", () => {
    expect(planResize(2000, 2000, 1568)).toEqual({ width: 1568, height: 1568 });
  });

  it("returns zero for degenerate dimensions", () => {
    expect(planResize(0, 0, 1568)).toEqual({ width: 0, height: 0 });
    expect(planResize(-10, 5, 1568)).toEqual({ width: 0, height: 0 });
  });
});

describe("isSupportedImageType", () => {
  it("accepts raster image types", () => {
    for (const m of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(isSupportedImageType(m)).toBe(true);
    }
  });

  it("rejects SVG (it is text), non-images, and nullish", () => {
    expect(isSupportedImageType("image/svg+xml")).toBe(false);
    expect(isSupportedImageType("text/plain")).toBe(false);
    expect(isSupportedImageType("application/pdf")).toBe(false);
    expect(isSupportedImageType(undefined)).toBe(false);
    expect(isSupportedImageType(null)).toBe(false);
    expect(isSupportedImageType("")).toBe(false);
  });

  it("matches the exported policy's accept list", () => {
    expect(IMAGE_ATTACHMENT_POLICY.acceptMimes).toContain("image/png");
    expect(IMAGE_ATTACHMENT_POLICY.acceptMimes).not.toContain("image/svg+xml");
  });
});

describe("decodedBytes", () => {
  it("computes decoded size from base64 length and padding", () => {
    expect(decodedBytes("AAAA")).toBe(3);
    expect(decodedBytes("AAA=")).toBe(2);
    expect(decodedBytes("AA==")).toBe(1);
    expect(decodedBytes("aGk=")).toBe(2); // base64("hi")
    expect(decodedBytes("")).toBe(0);
  });

  it("strips a data: URL prefix before measuring", () => {
    expect(decodedBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(decodedBytes("data:image/png;base64,")).toBe(0);
  });
});
