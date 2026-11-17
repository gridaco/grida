// GRIDA-SEC-004 — captured tool-result bytes have independent scoped read identities.
import { describe, expect, it } from "vitest";
import { NativeToolImages } from "./native-tool-images";

const descriptor = {
  mediaId: "workspace-view/captured",
  contentIndex: 1,
  mimeType: "image/png",
  totalBytes: 300 * 1024,
};

function captured() {
  const source = Buffer.alloc(descriptor.totalBytes, 7);
  source.set([137, 80, 78, 71, 13, 10, 26, 10]);
  source.writeUInt32BE(13, 8);
  source.write("IHDR", 12, "ascii");
  source.writeUInt32BE(1, 16);
  source.writeUInt32BE(1, 20);
  return source;
}

function fixture() {
  const owner = new NativeToolImages();
  const [offered] = owner.project("chat", "turn", "call", [descriptor]);
  const image = owner.require("chat", offered.previewId);
  const source = captured();
  const chunk = (offset: number) => {
    const bytes = source.subarray(offset, offset + 256 * 1024);
    const next = offset + bytes.length;
    return {
      ...image,
      offset,
      data: bytes.toString("base64"),
      nextOffset: next === source.length ? null : next,
    };
  };
  return { owner, offered, image, source, chunk };
}

describe("NativeToolImages", () => {
  it("keeps stable opaque identities for replay and assembles captured bytes in two bounded chunks", async () => {
    const f = fixture();
    expect(f.owner.project("chat", "turn", "call", [descriptor])).toEqual([
      f.offered,
    ]);
    expect(f.offered).toEqual({
      previewId: expect.any(String),
      mimeType: "image/png",
      size: descriptor.totalBytes,
    });
    const offsets: number[] = [];
    expect(
      Buffer.from(
        await f.owner.readChunks(f.image, async (offset) => {
          offsets.push(offset);
          return f.chunk(offset);
        })
      )
    ).toEqual(f.source);
    expect(offsets).toEqual([0, 256 * 1024]);
    expect(() => f.owner.require("foreign-chat", f.offered.previewId)).toThrow(
      "tool_image_unavailable"
    );
    expect(() => f.owner.require("chat", descriptor.mediaId)).toThrow(
      "tool_image_unavailable"
    );
    const changed = f.owner.project("chat", "other-turn", "call", [descriptor]);
    expect(changed[0].previewId).not.toBe(f.offered.previewId);
    f.owner.clear();
    expect(() => f.owner.require("chat", f.offered.previewId)).toThrow(
      "tool_image_unavailable"
    );
  });

  it.each([
    { sessionId: "foreign" },
    { turnId: "foreign" },
    { toolCallId: "foreign" },
    { mediaId: "workspace-view/foreign" },
    { contentIndex: 0 },
    { mimeType: "image/jpeg" },
    { totalBytes: descriptor.totalBytes + 1 },
    { offset: 1 },
    { nextOffset: 1 },
    { data: "YWJj" },
  ])(
    "refuses a chunk whose result identity or framing changed: %j",
    async (change) => {
      const f = fixture();
      await expect(
        f.owner.readChunks(f.image, async (offset) => ({
          ...f.chunk(offset),
          ...change,
        }))
      ).rejects.toThrow("tool_image_unavailable");
    }
  );

  it.each([
    { mediaId: "file:///source.png" },
    { mimeType: "image/svg+xml" },
    { contentIndex: -1 },
    { contentIndex: 1024 },
    { totalBytes: NativeToolImages.maxBytes + 1 },
    { totalBytes: 0 },
  ])("refuses invalid projected metadata: %j", (change) => {
    const owner = new NativeToolImages();
    expect(() =>
      owner.project("chat", "turn", "call", [{ ...descriptor, ...change }])
    ).toThrow("tool_image_unavailable");
  });

  it("refuses too many or duplicate result parts and non-raster bytes", async () => {
    const f = fixture();
    expect(() =>
      f.owner.project("chat", "turn", "call", [descriptor, descriptor])
    ).toThrow("tool_image_unavailable");
    expect(() =>
      f.owner.project(
        "chat",
        "turn",
        "call",
        Array.from({ length: 9 }, (_, contentIndex) => ({
          ...descriptor,
          contentIndex,
        }))
      )
    ).toThrow("tool_image_unavailable");
    f.source[0] = 0;
    await expect(
      f.owner.readChunks(f.image, async (offset) => f.chunk(offset))
    ).rejects.toThrow("tool_image_unavailable");
  });
});
