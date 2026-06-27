import { describe, it, expect } from "vitest";
import { AgentVision } from "./index";

// --- Magic-byte fixtures (smallest headers `sniff` inspects) ---------------

/** 8-byte PNG signature + a 16-byte IHDR carrying width/height (BE). */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  b[16] = (width >>> 24) & 0xff;
  b[17] = (width >>> 16) & 0xff;
  b[18] = (width >>> 8) & 0xff;
  b[19] = width & 0xff;
  b[20] = (height >>> 24) & 0xff;
  b[21] = (height >>> 16) & 0xff;
  b[22] = (height >>> 8) & 0xff;
  b[23] = height & 0xff;
  return b;
}

/** "GIF89a" + logical-screen width/height (LE). */
function gif(width: number, height: number): Uint8Array {
  const b = new Uint8Array(10);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  b[6] = width & 0xff;
  b[7] = (width >> 8) & 0xff;
  b[8] = height & 0xff;
  b[9] = (height >> 8) & 0xff;
  return b;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function reader(bytes: Uint8Array | null): AgentVision.ByteReader {
  return { readBytes: async () => bytes };
}

const call = (path = "/x.png") => ({
  tool_name: "view_image",
  input: { path },
});

describe("AgentVision.sniff", () => {
  it("identifies PNG with exact dimensions", () => {
    expect(AgentVision.sniff(png(512, 256))).toEqual({
      mime: "image/png",
      width: 512,
      height: 256,
    });
  });

  it("identifies GIF with exact dimensions", () => {
    expect(AgentVision.sniff(gif(16, 32))).toEqual({
      mime: "image/gif",
      width: 16,
      height: 32,
    });
  });

  it("identifies JPEG and WebP by mime (dims best-effort, omitted in v1)", () => {
    expect(AgentVision.sniff(JPEG)).toEqual({ mime: "image/jpeg" });
    expect(AgentVision.sniff(WEBP)).toEqual({ mime: "image/webp" });
  });

  it("rejects non-image bytes (an SVG / text source is not a raster)", () => {
    expect(AgentVision.sniff(new TextEncoder().encode("<svg/>"))).toBeNull();
    expect(AgentVision.sniff(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it("rejects a partial PNG/GIF prefix (full header required)", () => {
    // PNG with the right first 4 bytes but a corrupt rest of the signature.
    const fakePng = png(8, 8);
    fakePng[6] = 0x00; // break the 89 50 4E 47 0D 0A 1A 0A signature
    expect(AgentVision.sniff(fakePng)).toBeNull();
    // "GIF" + wrong version block.
    const fakeGif = gif(4, 4);
    fakeGif[3] = 0x00; // not '8'
    expect(AgentVision.sniff(fakeGif)).toBeNull();
  });
});

describe("AgentVision.resolveToolCall", () => {
  it("returns undefined for a tool that isn't view_image", async () => {
    expect(
      await AgentVision.resolveToolCall(reader(png(1, 1)), {
        tool_name: "read_file",
        input: { path: "/x" },
      })
    ).toBeUndefined();
  });

  it("not_found when the byte source has no such path", async () => {
    const out = await AgentVision.resolveToolCall(reader(null), call());
    expect(out).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("invalid_input for a malformed call (missing/empty/null path)", async () => {
    for (const input of [null, {}, { path: "" }, { path: 5 }]) {
      const out = await AgentVision.resolveToolCall(reader(png(1, 1)), {
        tool_name: "view_image",
        input,
      });
      expect(out).toMatchObject({ ok: false, reason: "invalid_input" });
    }
  });

  it("too_large when the reader throws OversizeError (no not_found mask)", async () => {
    const reader = {
      readBytes: async () => {
        throw new AgentVision.OversizeError(9_000_000);
      },
    };
    const out = await AgentVision.resolveToolCall(reader, call());
    expect(out).toMatchObject({ ok: false, reason: "too_large" });
    expect((out as AgentVision.ViewImageErr).message).toContain("9000000");
  });

  it("rethrows a non-oversize read error", async () => {
    const reader = {
      readBytes: async () => {
        throw new Error("disk on fire");
      },
    };
    await expect(AgentVision.resolveToolCall(reader, call())).rejects.toThrow(
      /disk on fire/
    );
  });

  it("too_large past the byte cap", async () => {
    const big = new Uint8Array(AgentVision.MAX_BYTES + 1);
    big.set(png(1, 1), 0);
    const out = await AgentVision.resolveToolCall(reader(big), call());
    expect(out).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("unsupported_type for non-raster bytes", async () => {
    const out = await AgentVision.resolveToolCall(
      reader(new TextEncoder().encode("not an image")),
      call()
    );
    expect(out).toMatchObject({ ok: false, reason: "unsupported_type" });
  });

  it("ok with mime, dims, byte count, and base64 data", async () => {
    const bytes = png(8, 8);
    const out = await AgentVision.resolveToolCall(reader(bytes), call());
    expect(out).toMatchObject({
      ok: true,
      mime: "image/png",
      width: 8,
      height: 8,
      bytes: bytes.byteLength,
    });
    // round-trips back to the original bytes
    const data = (out as AgentVision.ViewImageOk).data!;
    expect(Buffer.from(data, "base64")).toEqual(Buffer.from(bytes));
  });
});

describe("AgentVision.toModelOutput", () => {
  const input = { path: "/icon.png" };

  it("success WITH data → a media image block (model sees pixels)", () => {
    const out = AgentVision.toModelOutput(input, {
      ok: true,
      mime: "image/png",
      width: 4,
      height: 4,
      bytes: 24,
      data: "AAAA",
    });
    expect(out).toEqual({
      type: "content",
      value: [{ type: "media", mediaType: "image/png", data: "AAAA" }],
    });
  });

  it("success WITHOUT data (retention-elided) → a re-viewable text descriptor", () => {
    const out = AgentVision.toModelOutput(input, {
      ok: true,
      mime: "image/png",
      width: 4,
      height: 4,
      bytes: 24,
    });
    expect(out.type).toBe("text");
    expect((out as { value: string }).value).toContain("/icon.png");
    expect((out as { value: string }).value).toContain("re-view");
  });

  it("error → the error text", () => {
    const out = AgentVision.toModelOutput(input, {
      ok: false,
      reason: "not_found",
      message: "No file at /icon.png.",
    });
    expect(out).toEqual({ type: "text", value: "No file at /icon.png." });
  });
});
