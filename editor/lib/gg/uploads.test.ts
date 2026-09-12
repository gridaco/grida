// GRIDA-SEC-006 / GRIDA-SEC-012
// GRIDA-GG: gateway — upload custody and credential separation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ggUploads } from "./uploads";
import { gg } from "./gg";

const owner = { sub: "user-a", org: 41 };
const file = {
  file_token: "file_fixture",
  media_type: "image/png" as const,
  byte_length: 100,
};

beforeEach(() => {
  vi.stubEnv("GG_TOKEN_SECRET", "synthetic-gg-upload-secret-at-least-32-bytes");
  vi.stubEnv("GG_TOKEN_SECRET_PREVIOUS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GG upload references", () => {
  it("binds the content reference to the caller, organization and input type", async () => {
    const reference = { upload: await ggUploads.sign(owner, file) };
    await expect(ggUploads.verify(owner, reference, "image")).resolves.toEqual(
      file
    );
    for (const other of [
      { ...owner, org: 42 },
      { ...owner, sub: "user-b" },
    ])
      await expect(
        ggUploads.verify(other, reference, "image")
      ).rejects.toMatchObject({ code: "invalid_upload" });
    await expect(
      ggUploads.verify(owner, reference, "mesh")
    ).rejects.toMatchObject({ code: "invalid_upload" });
    await expect(
      ggUploads.verify(
        owner,
        { ...reference, file_token: "file_other" },
        "image"
      )
    ).rejects.toThrow(ggUploads.Failure);
  });

  it("cannot be used as a GG bearer, and a GG bearer cannot be used as an upload", async () => {
    const upload = await ggUploads.sign(owner, file);
    await expect(
      gg.verify(
        new Request("https://grida.co/api/v1/ai/models", {
          headers: { authorization: `Bearer ${upload}` },
        })
      )
    ).rejects.toMatchObject({ code: "invalid_token" });
    const { token } = await gg.sign(owner.sub, owner.org);
    await expect(
      ggUploads.verify(owner, { upload: token }, "image")
    ).rejects.toThrow(ggUploads.Failure);
  });

  it("rejects tampering, expiry and missing current configuration", async () => {
    vi.useFakeTimers();
    const upload = await ggUploads.sign(owner, file);
    await expect(
      ggUploads.verify(
        owner,
        { upload: `${upload.slice(0, -8)}tampered` },
        "image"
      )
    ).rejects.toThrow(ggUploads.Failure);
    vi.advanceTimersByTime(900_000);
    await expect(ggUploads.verify(owner, { upload }, "image")).rejects.toThrow(
      ggUploads.Failure
    );
    vi.stubEnv("GG_TOKEN_SECRET", "");
    await expect(ggUploads.sign(owner, file)).rejects.toMatchObject({
      code: "not_configured",
    });
    await expect(
      ggUploads.verify(owner, { upload }, "image")
    ).rejects.toMatchObject({ code: "not_configured" });
  });

  it("accepts the previous key only for verification during rotation", async () => {
    const upload = await ggUploads.sign(owner, file);
    vi.stubEnv(
      "GG_TOKEN_SECRET_PREVIOUS",
      "synthetic-gg-upload-secret-at-least-32-bytes"
    );
    vi.stubEnv(
      "GG_TOKEN_SECRET",
      "rotated-synthetic-gg-upload-secret-at-least-32-bytes"
    );
    await expect(ggUploads.verify(owner, { upload }, "image")).resolves.toEqual(
      file
    );
    vi.stubEnv("GG_TOKEN_SECRET_PREVIOUS", "");
    await expect(ggUploads.verify(owner, { upload }, "image")).rejects.toThrow(
      ggUploads.Failure
    );
  });

  it("bounds declared input types and sizes and permits only the exact presigned storage host", () => {
    expect(
      ggUploads.metadata({
        media_type: "model/gltf-binary",
        byte_length: 60_000_000,
      })
    ).toBeTruthy();
    for (const value of [
      { media_type: "model/gltf-binary", byte_length: 60_000_001 },
      { media_type: "image/png", byte_length: 20_000_001 },
      { media_type: "image/png", byte_length: 0 },
      { media_type: "image/svg+xml", byte_length: 100 },
      { ...file },
    ])
      expect(() => ggUploads.metadata(value)).toThrow(ggUploads.Failure);
    const allowed =
      "https://tripo-data.s3.us-west-2.amazonaws.com/file.glb?X-Amz-Signature=synthetic";
    expect(ggUploads.uploadUrl(allowed)).toBe(allowed);
    for (const url of [
      allowed.replace("https:", "http:"),
      allowed.replace(
        "tripo-data.s3.us-west-2.amazonaws.com",
        "attacker.example"
      ),
      allowed.replace(
        "tripo-data.s3.us-west-2.amazonaws.com",
        "tripo-data.s3.us-west-2.amazonaws.com.attacker.example"
      ),
      allowed + "#fragment",
      allowed.replace("https://", "https://user:secret@"),
      "https://tripo-data.s3.us-west-2.amazonaws.com/file.glb",
    ])
      expect(() => ggUploads.uploadUrl(url)).toThrow(ggUploads.Failure);
  });
});
