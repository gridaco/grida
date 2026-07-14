import { describe, it, expect } from "vitest";
import { SCRATCH_SEED_LIMITS, USER_FILE_ATTACHMENTS } from "@grida/agent";
import {
  extractOperableFiles,
  lowerOperableFiles,
  readFileAsBase64,
  OPERABLE_FILE_POLICY,
} from "./file-attachment";

describe("OPERABLE_FILE_POLICY", () => {
  it("derives every atomic batch ceiling from the agent wire contract", () => {
    expect(OPERABLE_FILE_POLICY).toEqual({
      maxBytes: SCRATCH_SEED_LIMITS.maxTotalBytes,
      maxFiles: SCRATCH_SEED_LIMITS.maxFiles,
      maxTotalBytes: SCRATCH_SEED_LIMITS.maxTotalBytes,
    });
  });
});

describe("lowerOperableFiles", () => {
  it("lowers typed resources with stable ids in order", () => {
    const out = lowerOperableFiles([
      {
        id: "resource-report",
        name: "report.pdf",
        mime: "application/pdf",
        size: 3,
        base64: "AAAA",
      },
      {
        id: "resource-data",
        name: "data.bin",
        mime: "application/octet-stream",
        size: 1,
        base64: "AA==",
      },
    ]);

    expect(out).toEqual({
      scratchSeed: [
        {
          path: "upload-resource-report-report.pdf",
          base64: "AAAA",
        },
        { path: "upload-resource-data-data.bin", base64: "AA==" },
      ],
      context: {
        type: USER_FILE_ATTACHMENTS,
        data: {
          location: "scratch",
          files: [
            {
              name: "report.pdf",
              mime: "application/pdf",
              size: 3,
              path: "upload-resource-report-report.pdf",
            },
            {
              name: "data.bin",
              mime: "application/octet-stream",
              size: 1,
              path: "upload-resource-data-data.bin",
            },
          ],
        },
      },
    });
  });

  it("sanitizes and dedupes typed resources without mutating the input", () => {
    const files = [
      {
        id: "same/id",
        name: "../a.pdf",
        mime: "application/pdf",
        size: 3,
        base64: "AAAA",
      },
      {
        id: "same/id",
        name: "../a.pdf",
        mime: "application/pdf",
        size: 3,
        base64: "BBBB",
      },
    ] as const;

    expect(
      lowerOperableFiles(files).scratchSeed.map((seed) => seed.path)
    ).toEqual(["upload-same_id-a.pdf", "upload-same_id-a-2.pdf"]);
    expect(files[0].name).toBe("../a.pdf");
  });

  it("preserves a typed zero-byte file", () => {
    expect(
      lowerOperableFiles([
        {
          id: "empty",
          name: "empty.bin",
          mime: "application/octet-stream",
          size: 0,
          base64: "",
        },
      ])
    ).toEqual({
      scratchSeed: [{ path: "upload-empty-empty.bin", base64: "" }],
      context: {
        type: USER_FILE_ATTACHMENTS,
        data: {
          location: "scratch",
          files: [
            {
              name: "empty.bin",
              mime: "application/octet-stream",
              size: 0,
              path: "upload-empty-empty.bin",
            },
          ],
        },
      },
    });
  });

  it("returns an empty lowering for no typed resources", () => {
    expect(lowerOperableFiles([])).toEqual({
      scratchSeed: [],
      context: null,
    });
  });
});

describe("extractOperableFiles", () => {
  it("returns no seed and a null context when there are no operable parts", () => {
    const out = extractOperableFiles([
      { type: "text" },
      // A perceive image: inline `url`, no `payload.base64` → left for toFileUiParts.
      {
        type: "file-attachment",
        name: "a.png",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
      },
    ]);
    expect(out.scratchSeed).toEqual([]);
    expect(out.context).toBeNull();
  });

  it("claims base64 file-attachment parts, building the scratch seed + marker", () => {
    const out = extractOperableFiles([
      {
        type: "file-attachment",
        id: "attachment-1-report-pdf",
        name: "report.pdf",
        mime: "application/pdf",
        size: 3,
        payload: { base64: "AAAA" },
      },
      // Perceive image alongside it → skipped here (claimed by toFileUiParts).
      {
        type: "file-attachment",
        name: "img.png",
        mime: "image/png",
        url: "data:image/png;base64,BBBB",
      },
    ]);
    expect(out.scratchSeed).toEqual([
      {
        path: "upload-attachment-1-report-pdf-report.pdf",
        base64: "AAAA",
      },
    ]);
    expect(out.context).toEqual({
      type: USER_FILE_ATTACHMENTS,
      data: {
        location: "scratch",
        files: [
          {
            name: "report.pdf",
            mime: "application/pdf",
            size: 3,
            path: "upload-attachment-1-report-pdf-report.pdf",
          },
        ],
      },
    });
  });

  it("reduces an unsafe filename to a single safe scratch segment", () => {
    const out = extractOperableFiles([
      {
        type: "file-attachment",
        name: "../../etc/pa ss wd",
        payload: { base64: "AAAA" },
      },
    ]);
    expect(out.scratchSeed).toHaveLength(1);
    const path = out.scratchSeed[0].path;
    expect(path).not.toContain("/");
    expect(path).not.toContain("..");
    expect(path.startsWith(".")).toBe(false);
  });

  it("dedupes colliding names within a batch", () => {
    const out = extractOperableFiles([
      { type: "file-attachment", name: "a.pdf", payload: { base64: "AAAA" } },
      { type: "file-attachment", name: "a.pdf", payload: { base64: "BBBB" } },
    ]);
    expect(out.scratchSeed.map((s) => s.path)).toEqual([
      "upload-attachment-a.pdf",
      "upload-attachment-a-2.pdf",
    ]);
  });

  it("skips a part whose base64 is missing or empty", () => {
    const out = extractOperableFiles([
      { type: "file-attachment", name: "empty", payload: { base64: "" } },
      { type: "file-attachment", name: "nopayload" },
    ]);
    expect(out.scratchSeed).toEqual([]);
    expect(out.context).toBeNull();
  });
});

describe("readFileAsBase64", () => {
  it("encodes a small file to base64 with metadata", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.bin", {
      type: "application/octet-stream",
    });
    const out = await readFileAsBase64(file);
    expect(out).toMatchObject({
      name: "a.bin",
      mime: "application/octet-stream",
      size: 3,
    });
    // base64 of bytes 0x01 0x02 0x03.
    expect(out?.base64).toBe("AQID");
  });

  it("falls back to a generic mime when the file has none", async () => {
    const file = new File([new Uint8Array([0])], "x", { type: "" });
    const out = await readFileAsBase64(file);
    expect(out?.mime).toBe("application/octet-stream");
  });

  it("returns null for a file over the size cap", async () => {
    const big = new File(
      [new Uint8Array(OPERABLE_FILE_POLICY.maxBytes + 1)],
      "big.bin"
    );
    expect(await readFileAsBase64(big)).toBeNull();
  });
});
