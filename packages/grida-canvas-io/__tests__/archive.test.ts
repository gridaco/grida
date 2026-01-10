import { io } from "../index";
import grida from "@grida/schema";
import { unzipSync, strFromU8 } from "fflate";
import * as fs from "fs";
import * as path from "path";

function toU8(bytes: Uint8Array | Uint8ClampedArray): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function createFile(filename: string, content: Uint8Array): File {
  const blob = new Blob([content as BlobPart], {
    type: "application/octet-stream",
  });
  return new File([blob], filename, { type: "application/octet-stream" });
}

describe("archive (.grida zip)", () => {
  const schemaVersion = "0.0.0-test+00000000";

  // Helper to create a minimal test document
  function createTestDocument(): grida.program.document.Document {
    return {
      nodes: {},
      links: {},
      scenes_ref: [],
      entry_scene_id: undefined,
      images: {},
      bitmaps: {},
      properties: {},
    };
  }

  // Helper to get FlatBuffers bytes from a document for comparison
  function getDocumentBytes(
    document: grida.program.document.Document
  ): Uint8Array {
    return io.GRID.encode(document, schemaVersion);
  }

  const fixtureDir = path.join(__dirname, "../../../fixtures/images");
  const fixtureImages: Record<string, Uint8Array> = {
    "checker.png": toU8(fs.readFileSync(path.join(fixtureDir, "checker.png"))),
    "stripes.png": toU8(fs.readFileSync(path.join(fixtureDir, "stripes.png"))),
    "1024.jpg": toU8(fs.readFileSync(path.join(fixtureDir, "1024.jpg"))),
    "512.jpg": toU8(fs.readFileSync(path.join(fixtureDir, "512.jpg"))),
    "4k.jpg": toU8(fs.readFileSync(path.join(fixtureDir, "4k.jpg"))),
    "8k.jpg": toU8(fs.readFileSync(path.join(fixtureDir, "8k.jpg"))),
  };

  // Helper function to save ZIP artifacts for inspection
  const artifactsDir = path.join(__dirname, "artifacts");
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  function saveArtifact(name: string, data: Uint8Array): string {
    const artifactPath = path.join(artifactsDir, `${name}.zip`);
    fs.writeFileSync(artifactPath, data);
    return artifactPath;
  }

  it("should pack/unpack archive without images", () => {
    const document = createTestDocument();
    const packed = io.archive.pack(document, undefined, schemaVersion);
    saveArtifact("archive-no-images", packed);

    // ZIP magic number
    expect(packed[0]).toBe(0x50); // P
    expect(packed[1]).toBe(0x4b); // K

    const unpacked = io.archive.unpack(packed);
    expect(unpacked.manifest.version).toBe(schemaVersion);
    const expectedBytes = getDocumentBytes(document);
    expect(bytesEqual(unpacked.document, expectedBytes)).toBe(true);
    expect(unpacked.images).toEqual({});
  });

  it("should pack/unpack archive with mock images", () => {
    const document = createTestDocument();
    const images: Record<string, Uint8Array> = {
      "photo.jpg": new Uint8Array([1, 2, 3, 4, 5]),
      "logo.png": new Uint8Array([6, 7, 8, 9, 10]),
      "icon.svg": new Uint8Array([
        60, 115, 118, 103, 62, 60, 47, 115, 118, 103, 62,
      ]),
    };
    const packed = io.archive.pack(document, images, schemaVersion);
    saveArtifact("archive-mock-images", packed);

    const unpacked = io.archive.unpack(packed);
    expect(Object.keys(unpacked.images)).toHaveLength(3);
    for (const [k, v] of Object.entries(images)) {
      expect(bytesEqual(unpacked.images[k], v)).toBe(true);
    }
  });

  it("should pack/unpack archive with bitmaps (png)", () => {
    const document = createTestDocument();
    const bitmap: io.Bitmap = {
      version: 0,
      width: 2,
      height: 2,
      // RGBA pixels (2x2)
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
      ]),
    };

    const packed = io.archive.pack(document, undefined, schemaVersion, {
      preview: bitmap,
    });

    const unpacked = io.archive.unpack(packed);
    expect(Object.keys(unpacked.bitmaps)).toEqual(["preview"]);
    expect(unpacked.bitmaps.preview.width).toBe(2);
    expect(unpacked.bitmaps.preview.height).toBe(2);
    expect(unpacked.bitmaps.preview.data).toEqual(bitmap.data);
  });

  it("should pack/unpack archive with real fixture images", () => {
    const document = createTestDocument();
    const images = {
      "checker.png": fixtureImages["checker.png"],
      "stripes.png": fixtureImages["stripes.png"],
      "1024.jpg": fixtureImages["1024.jpg"],
      "512.jpg": fixtureImages["512.jpg"],
    };
    const packed = io.archive.pack(document, images, schemaVersion);
    saveArtifact("archive-real-images", packed);

    const unpacked = io.archive.unpack(packed);
    expect(Object.keys(unpacked.images).sort()).toEqual(
      Object.keys(images).sort()
    );
    for (const [k, v] of Object.entries(images)) {
      expect(bytesEqual(unpacked.images[k], v)).toBe(true);
    }
  });

  it("should maintain data integrity through multiple pack/unpack cycles", () => {
    const document = createTestDocument();
    const images = {
      "checker.png": fixtureImages["checker.png"],
      "stripes.png": fixtureImages["stripes.png"],
      "1024.jpg": fixtureImages["1024.jpg"],
    };

    let currentDocument = document;
    let currentImages: Record<string, Uint8Array> = images;

    for (let i = 0; i < 3; i++) {
      const packed = io.archive.pack(
        currentDocument,
        currentImages,
        schemaVersion
      );
      const unpacked = io.archive.unpack(packed);
      // Decode the document from FlatBuffers bytes
      currentDocument = io.GRID.decode(unpacked.document);
      currentImages = unpacked.images;
    }

    const expectedBytes = getDocumentBytes(document);
    const finalBytes = getDocumentBytes(currentDocument);
    expect(bytesEqual(finalBytes, expectedBytes)).toBe(true);
    expect(Object.keys(currentImages).sort()).toEqual(
      Object.keys(images).sort()
    );
    for (const [k, v] of Object.entries(images)) {
      expect(bytesEqual(currentImages[k], v)).toBe(true);
    }
  });

  it("should handle empty images object", () => {
    const document = createTestDocument();
    const packed = io.archive.pack(document, {}, schemaVersion);
    const unpacked = io.archive.unpack(packed);
    expect(unpacked.images).toEqual({});
  });

  it("should handle special characters in image filenames", () => {
    const document = createTestDocument();
    const specialImages: Record<string, Uint8Array> = {
      "image with spaces.png": new Uint8Array([1, 2, 3, 4, 5]),
      "image-with-dashes.jpg": new Uint8Array([6, 7, 8, 9, 10]),
      "image_with_underscores.svg": new Uint8Array([11, 12, 13, 14, 15]),
      "image.with.dots.gif": new Uint8Array([16, 17, 18, 19, 20]),
    };
    const packed = io.archive.pack(document, specialImages, schemaVersion);
    const unpacked = io.archive.unpack(packed);
    expect(Object.keys(unpacked.images).sort()).toEqual(
      Object.keys(specialImages).sort()
    );
    for (const [k, v] of Object.entries(specialImages)) {
      expect(bytesEqual(unpacked.images[k], v)).toBe(true);
    }
  });

  it("io.is_zip should detect .grida archives", async () => {
    const document = createTestDocument();
    const packed = io.archive.pack(document, fixtureImages, schemaVersion);
    const file = createFile("test.grida", packed);
    await expect(io.is_zip(file)).resolves.toBe(true);
  });

  it("performance: should pack/unpack mixed real files efficiently", () => {
    const document = createTestDocument();
    const mixedImages = {
      "checker.png": fixtureImages["checker.png"],
      "stripes.png": fixtureImages["stripes.png"],
      "1024.jpg": fixtureImages["1024.jpg"],
      "512.jpg": fixtureImages["512.jpg"],
    };

    const start = Date.now();
    const packed = io.archive.pack(document, mixedImages, schemaVersion);
    const unpacked = io.archive.unpack(packed);
    const end = Date.now();

    expect(Object.keys(unpacked.images)).toHaveLength(4);
    expect(end - start).toBeLessThan(5000);
  });

  it("file size analysis: should produce non-empty archives", () => {
    const document = createTestDocument();
    const pngFiles = {
      "checker.png": fixtureImages["checker.png"],
      "stripes.png": fixtureImages["stripes.png"],
    };
    const jpgFiles = {
      "1024.jpg": fixtureImages["1024.jpg"],
      "512.jpg": fixtureImages["512.jpg"],
    };
    const largeFiles = {
      "4k.jpg": fixtureImages["4k.jpg"],
      "8k.jpg": fixtureImages["8k.jpg"],
    };

    const pngPacked = io.archive.pack(document, pngFiles, schemaVersion);
    const jpgPacked = io.archive.pack(document, jpgFiles, schemaVersion);
    const largePacked = io.archive.pack(document, largeFiles, schemaVersion);

    expect(pngPacked.length).toBeGreaterThan(0);
    expect(jpgPacked.length).toBeGreaterThan(0);
    expect(largePacked.length).toBeGreaterThan(0);
  });

  it("should include document.grida1 in archive", () => {
    const document = createTestDocument();
    const packed = io.archive.pack(document, undefined, schemaVersion);
    const files = unzipSync(packed);

    expect(files["document.grida1"]).toBeDefined();
    const snapshotJson = strFromU8(files["document.grida1"]);
    const snapshot = JSON.parse(snapshotJson);
    expect(snapshot.version).toBe(schemaVersion);
    expect(snapshot.document).toBeDefined();
    expect(snapshot.document.nodes).toEqual({});
    expect(snapshot.document.links).toEqual({});
  });
});
