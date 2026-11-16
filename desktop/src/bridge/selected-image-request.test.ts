// GRIDA-SEC-004 — renderer File values cannot manufacture a trusted source path.
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { SelectedImageRequest } from "./selected-image-request";

describe("SelectedImageRequest", () => {
  it("hashes frozen bytes and resolves a disk path only from the original picker File", async () => {
    const originalFile = new File(["changed-live-backing"], "original.jpg", {
      lastModified: 123,
    });
    const file = new File(["original"], "original.jpg", {
      type: "image/jpeg",
      lastModified: 123,
    });
    const read = vi.spyOn(file, "arrayBuffer");
    const result = await SelectedImageRequest.from(
      {
        action: "submit",
        inputId: "input",
        text: "Look",
        operatingRegime: "act",
        file,
        originalFile,
      },
      (origin) => {
        expect(origin).toBe(originalFile);
        return "/chosen/original.jpg";
      }
    );
    expect(result).toEqual({
      action: "submit",
      inputId: "input",
      text: "Look",
      operatingRegime: "act",
      name: "original.jpg",
      path: "/chosen/original.jpg",
      sha256: [...createHash("sha256").update("original").digest()],
      size: 8,
      lastModified: 123,
    });
    expect(read).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("file");
  });
  it("captures a browser-created File as its original bytes without claiming disk origin", async () => {
    const file = new File(["original-not-poster"], "clipboard.webp", {
      type: "image/webp",
    });
    const result = await SelectedImageRequest.from(
      { file, inputId: "input" },
      () => ""
    );
    expect(new TextDecoder().decode(result.bytes as ArrayBuffer)).toBe(
      "original-not-poster"
    );
    expect(result).not.toHaveProperty("path");
    expect(result.name).toBe("clipboard.webp");
  });
  it("refuses caller-claimed source fields and oversized originals", async () => {
    const file = new File(["bytes"], "original.jpg");
    for (const claimed of [
      { path: "/secret" },
      { bytes: new ArrayBuffer(1) },
      { name: "forged" },
      { source: "disk" },
      { sha256: [] },
    ])
      await expect(
        SelectedImageRequest.from(
          { file, ...claimed },
          () => "/chosen/original.jpg"
        )
      ).rejects.toThrow("unavailable");
    await expect(
      SelectedImageRequest.from(
        {
          file: new File([new ArrayBuffer(20 * 1024 * 1024 + 1)], "large.jpg"),
        },
        () => ""
      )
    ).rejects.toThrow("unavailable");
  });
});
