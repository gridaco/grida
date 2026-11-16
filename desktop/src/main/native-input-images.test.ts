// GRIDA-SEC-004 — opaque previews select an exact retained image, never a path.
import { describe, expect, it } from "vitest";
import { NativeInputImages } from "./native-input-images";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=",
  "base64"
);
const URI = "urn:grida:retained-attachment:owned-image";
const reply = () => ({
  messageId: "message",
  attachmentUri: URI,
  mimeType: "image/png",
  data: PNG.toString("base64"),
});

describe("NativeInputImages", () => {
  it("assembles an original raster in bounded chunks with exact MIME, total and offsets", async () => {
    const images = new NativeInputImages();
    const bytes = Buffer.concat([
      Buffer.alloc(256 * 1024, 7),
      Buffer.from("original-jpeg-tail"),
    ]);
    const token = images.offer(
      "chat",
      "message",
      URI,
      bytes.length,
      "image/jpeg",
      true
    )!;
    const image = images.require("chat", token);
    const offsets: number[] = [];
    const result = await images.readChunks(image, async (offset) => {
      offsets.push(offset);
      const chunk = bytes.subarray(offset, offset + 256 * 1024);
      const next = offset + chunk.length;
      return {
        messageId: "message",
        attachmentUri: URI,
        mimeType: "image/jpeg",
        totalBytes: bytes.length,
        offset,
        data: chunk.toString("base64"),
        nextOffset: next === bytes.length ? null : next,
      };
    });
    expect(offsets).toEqual([0, 256 * 1024]);
    expect(Buffer.from(result)).toEqual(bytes);
    expect(
      images.offer("chat", "message", URI, bytes.length, "image/jpeg")
    ).toBeUndefined();
    expect(
      images.offer(
        "chat",
        "message",
        URI,
        20 * 1024 * 1024 + 1,
        "image/png",
        true
      )
    ).toBeUndefined();
  });

  it("refuses a changed chunk identity, inconsistent progress, noncanonical bytes and unbounded totals", async () => {
    const images = new NativeInputImages();
    const token = images.offer("chat", "message", URI, 3, "image/webp", true)!;
    const image = images.require("chat", token);
    const good = {
      messageId: "message",
      attachmentUri: URI,
      mimeType: "image/webp",
      totalBytes: 3,
      offset: 0,
      data: Buffer.from("abc").toString("base64"),
      nextOffset: null,
    };
    for (const changed of [
      { messageId: "other" },
      { attachmentUri: "other" },
      { mimeType: "image/png" },
      { totalBytes: 20 * 1024 * 1024 + 1 },
      { totalBytes: 4 },
      { offset: 1 },
      { nextOffset: 0 },
      { nextOffset: 3 },
      { data: "" },
      { data: good.data + "\n" },
    ])
      await expect(
        images.readChunks(image, async () => ({ ...good, ...changed }))
      ).rejects.toThrow("input_image_unavailable");
  });
  it("offers stable opaque selectors for retained images, scoped to their session and message", () => {
    const images = new NativeInputImages();
    const token = images.offer("chat", "message", URI, PNG.length)!;
    expect(token).toMatch(/^[a-f0-9-]{36}$/);
    expect(images.offer("chat", "message", URI, PNG.length)).toBe(token);
    expect(images.offer("chat", "another-message", URI, PNG.length)).not.toBe(
      token
    );
    expect(() => images.require("another-chat", token)).toThrow(
      "input_image_unavailable"
    );
    expect(() => images.require("chat", URI)).toThrow(
      "input_image_unavailable"
    );
    const image = images.require("chat", token);
    expect(new Uint8Array(images.decode(reply(), image))).toEqual(
      Uint8Array.from(PNG)
    );
    images.clear();
    expect(() => images.require("chat", token)).toThrow(
      "input_image_unavailable"
    );
  });

  it("never offers a file/remote URI, malformed selector or oversized image", () => {
    const images = new NativeInputImages();
    for (const uri of [
      "file:///private/a.png",
      "https://example.com/a.png",
      "data:image/png;base64,aa==",
      "urn:grida:retained-attachment:",
      `${URI}\n`,
    ])
      expect(images.offer("chat", "message", uri, PNG.length)).toBeUndefined();
    for (const size of [-1, 0, 32, 256 * 1024 + 1, NaN, 1.5])
      expect(images.offer("chat", "message", URI, size)).toBeUndefined();
  });

  it("validates the exact identity, canonical bounded bytes and PNG dimensions", () => {
    const images = new NativeInputImages();
    const token = images.offer("chat", "message", URI, PNG.length)!;
    const image = images.require("chat", token);
    for (const replacement of [
      { messageId: "other" },
      { attachmentUri: `${URI}-other` },
      { mimeType: "image/svg+xml" },
      { data: "" },
      { data: "eA==" },
      { data: `${PNG.toString("base64")}\n` },
      { data: "A".repeat(400_000) },
    ])
      expect(() =>
        images.decode({ ...reply(), ...replacement }, image)
      ).toThrow("input_image_unavailable");
    const huge = Buffer.from(PNG);
    huge.writeUInt32BE(16384, 16);
    huge.writeUInt32BE(16384, 20);
    expect(() =>
      images.decode({ ...reply(), data: huge.toString("base64") }, image)
    ).toThrow("input_image_unavailable");
    const wrongSize = images.require(
      "chat",
      images.offer("chat", "message", URI, PNG.length + 1)!
    );
    expect(() => images.decode(reply(), wrongSize)).toThrow(
      "input_image_unavailable"
    );
  });

  it("bounds retained selector memory and retires the oldest selector", () => {
    const images = new NativeInputImages();
    const first = images.offer("chat", "first", URI)!;
    for (let i = 0; i < 2048; i++) images.offer("chat", `message-${i}`, URI);
    expect(() => images.require("chat", first)).toThrow(
      "input_image_unavailable"
    );
    const current = images.offer("chat", "message-2047", URI)!;
    expect(images.require("chat", current).messageId).toBe("message-2047");
  });
});
