import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_ATTACHMENT_POLICY,
  decodedBytes,
  encodeLibraryImageUrl,
  isSupportedImageType,
  planResize,
  toFileUiParts,
  trustedLibraryImageUrl,
} from "./image-attachment";

type StubImage = {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
};

function stubImage(): () => StubImage {
  const instances: StubImage[] = [];
  vi.stubGlobal(
    "Image",
    class {
      crossOrigin = "";
      decoding = "";
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";

      constructor() {
        instances.push(this);
      }
    }
  );
  return () => {
    const instance = instances[0];
    if (!instance) throw new Error("Image was not constructed");
    return instance;
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("encodeLibraryImageUrl", () => {
  const base = "https://project.supabase.co";
  const url = `${base}/storage/v1/object/public/library/example.png`;
  const policy = { ...IMAGE_ATTACHMENT_POLICY, loadTimeoutMs: 25 };

  it("stops a stalled Library image load at the configured timeout", async () => {
    vi.useFakeTimers();
    const getImage = stubImage();

    const encoded = encodeLibraryImageUrl(
      url,
      "example.png",
      "image/png",
      policy,
      ["image/png"],
      base
    );
    expect(getImage().src).toBe(url);

    await vi.advanceTimersByTimeAsync(policy.loadTimeoutMs);

    await expect(encoded).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(getImage()).toMatchObject({
      onload: null,
      onerror: null,
      src: "",
    });
  });

  it.each(["load", "error"] as const)(
    "clears the timeout and image state after %s",
    async (event) => {
      vi.useFakeTimers();
      const getImage = stubImage();

      const encoded = encodeLibraryImageUrl(
        url,
        "example.png",
        "image/png",
        policy,
        ["image/png"],
        base
      );
      const image = getImage();
      if (event === "load") image.onload?.();
      else image.onerror?.();

      await expect(encoded).resolves.toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(image).toMatchObject({ onload: null, onerror: null, src: "" });
    }
  );
});

describe("trustedLibraryImageUrl", () => {
  const base = "https://project.supabase.co";

  it("accepts only public-storage objects on the configured Library origin", () => {
    expect(
      trustedLibraryImageUrl(
        `${base}/storage/v1/object/public/library/example.png`,
        base
      )?.href
    ).toBe(`${base}/storage/v1/object/public/library/example.png`);
    expect(
      trustedLibraryImageUrl(`${base}/storage/v1/object/private/x.png`, base)
    ).toBeNull();
    expect(
      trustedLibraryImageUrl(
        "https://attacker.test/storage/v1/object/public/library/x.png",
        base
      )
    ).toBeNull();
    expect(
      trustedLibraryImageUrl(
        "http://project.supabase.co/storage/v1/object/public/library/x.png",
        base
      )
    ).toBeNull();
  });
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

describe("toFileUiParts", () => {
  it("maps only inlined raster image attachments to FileUIParts", () => {
    const parts = [
      {
        type: "file-attachment",
        mime: "image/png",
        url: "data:image/png;base64,AAA",
        name: "a.png",
      },
      // svg — excluded (text)
      {
        type: "file-attachment",
        mime: "image/svg+xml",
        url: "data:image/svg+xml;base64,AAA",
        name: "b.svg",
      },
      // no url — excluded
      { type: "file-attachment", mime: "image/png", name: "c.png" },
      // not an image — excluded
      {
        type: "file-attachment",
        mime: "application/pdf",
        url: "data:application/pdf;base64,AAA",
        name: "d.pdf",
      },
      // not a file-attachment — excluded
      { type: "text", url: "data:image/png;base64,AAA" },
    ];

    expect(toFileUiParts(parts)).toEqual([
      {
        type: "file",
        url: "data:image/png;base64,AAA",
        mediaType: "image/png",
        filename: "a.png",
      },
    ]);
  });

  it("returns an empty array when nothing qualifies", () => {
    expect(toFileUiParts([])).toEqual([]);
    expect(toFileUiParts([{ type: "text" }])).toEqual([]);
  });
});
