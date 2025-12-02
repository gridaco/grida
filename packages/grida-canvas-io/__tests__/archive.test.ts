import { io } from "../index";
import * as fs from "fs";
import * as path from "path";

// Load real image files from fixtures at the top for maintainability
const FIXTURE_IMAGES = {
  "checker.png": (() => {
    const imagePath = path.join(
      __dirname,
      "../../../fixtures/images",
      "checker.png"
    );
    const buffer = fs.readFileSync(imagePath);
    return new Uint8ClampedArray(buffer);
  })(),
  "stripes.png": (() => {
    const imagePath = path.join(
      __dirname,
      "../../../fixtures/images",
      "stripes.png"
    );
    const buffer = fs.readFileSync(imagePath);
    return new Uint8ClampedArray(buffer);
  })(),
  "1024.jpg": (() => {
    const imagePath = path.join(
      __dirname,
      "../../../fixtures/images",
      "1024.jpg"
    );
    const buffer = fs.readFileSync(imagePath);
    return new Uint8ClampedArray(buffer);
  })(),
  "512.jpg": (() => {
    const imagePath = path.join(
      __dirname,
      "../../../fixtures/images",
      "512.jpg"
    );
    const buffer = fs.readFileSync(imagePath);
    return new Uint8ClampedArray(buffer);
  })(),
  "4k.jpg": (() => {
    const imagePath = path.join(
      __dirname,
      "../../../fixtures/images",
      "4k.jpg"
    );
    const buffer = fs.readFileSync(imagePath);
    return new Uint8ClampedArray(buffer);
  })(),
  "8k.jpg": (() => {
    const imagePath = path.join(
      __dirname,
      "../../../fixtures/images",
      "8k.jpg"
    );
    const buffer = fs.readFileSync(imagePath);
    return new Uint8ClampedArray(buffer);
  })(),
};

describe("archive comprehensive", () => {
  // Create artifacts directory for ZIP files
  const artifactsDir = path.join(__dirname, "artifacts");
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  // Simple document data for testing
  const mockDocumentData: io.JSONDocumentFileModel = {
    version: "0.0.1-beta.2+20251201",
    document: {
      nodes: {
        scene1: {
          type: "scene",
          id: "scene1",
          name: "Test Scene",
          active: true,
          locked: false,
          guides: [],
          edges: [],
          constraints: { children: "multiple" },
        },
      },
      links: {
        scene1: [],
      },
      scenes_ref: ["scene1"],
      entry_scene_id: "scene1",
      bitmaps: {},
      images: {},
      properties: {},
    },
  };

  // Complex document data for testing (without bitmaps for now)
  const complexDocumentData: io.JSONDocumentFileModel = {
    version: "0.0.1-beta.2+20251201",
    document: {
      nodes: {
        scene1: {
          type: "scene",
          id: "scene1",
          name: "Test Scene",
          active: true,
          locked: false,
          guides: [],
          edges: [],
          constraints: { children: "multiple" },
        },
        node1: {
          type: "rectangle",
          id: "node1",
          name: "Test Rectangle",
          width: 100,
          height: 100,
          active: false,
          locked: false,
          position: "absolute",
          opacity: 1,
          rotation: 0,
          z_index: 0,
          stroke_width: 0,
          stroke_cap: "butt",
          stroke_join: "miter",
          fill: {
            type: "solid",
            color: { r: 0, g: 0, b: 0, a: 0 } as any,
            active: true,
          },
        },
      },
      links: {
        scene1: ["node1"],
      },
      scenes_ref: ["scene1"],
      entry_scene_id: "scene1",
      bitmaps: {},
      images: {},
      properties: {},
    },
  };

  const mockImages = {
    "photo.jpg": new Uint8ClampedArray([1, 2, 3, 4, 5]),
    "logo.png": new Uint8ClampedArray([6, 7, 8, 9, 10]),
  };

  const complexMockImages = {
    "photo.jpg": new Uint8ClampedArray([1, 2, 3, 4, 5]),
    "logo.png": new Uint8ClampedArray([6, 7, 8, 9, 10]),
    "icon.svg": new Uint8ClampedArray([
      60, 115, 118, 103, 62, 60, 47, 115, 118, 103, 62,
    ]), // "<svg></svg>"
  };

  // Helper function to create a mock File object from real image data
  function createRealFile(filename: string, content: Uint8Array): File {
    const blob = new Blob([content as BlobPart], {
      type: getMimeType(filename),
    });
    return new File([blob], filename, { type: getMimeType(filename) });
  }

  function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".png":
        return "image/png";
      case ".gif":
        return "image/gif";
      case ".svg":
        return "image/svg+xml";
      default:
        return "application/octet-stream";
    }
  }

  // Helper function to save ZIP artifacts for inspection
  function saveArtifact(name: string, data: Uint8Array): string {
    const artifactPath = path.join(artifactsDir, `${name}.zip`);
    fs.writeFileSync(artifactPath, data);
    console.log(`Saved artifact: ${artifactPath}`);
    return artifactPath;
  }

  describe("pack with mock data", () => {
    it("should pack document without images", () => {
      const packed = io.archive.pack(mockDocumentData);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.length).toBeGreaterThan(0);

      // Save artifact for inspection
      saveArtifact("document-without-images", packed);
    });

    it("should pack document with simple mock images", () => {
      const packed = io.archive.pack(mockDocumentData, mockImages);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.length).toBeGreaterThan(0);

      // Save artifact for inspection
      saveArtifact("document-with-mock-images", packed);
    });

    it("should pack document with complex mock images", () => {
      const packed = io.archive.pack(complexDocumentData, complexMockImages);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.length).toBeGreaterThan(0);
    });

    it("should create valid ZIP structure", () => {
      const packed = io.archive.pack(mockDocumentData, mockImages);
      // Check ZIP magic number
      expect(packed[0]).toBe(0x50); // 'P'
      expect(packed[1]).toBe(0x4b); // 'K'
      expect(packed[2]).toBe(0x03);
      expect(packed[3]).toBe(0x04);
    });
  });

  describe("pack with real files", () => {
    it("should pack document with real PNG files", () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.length).toBeGreaterThan(0);

      // Save artifact for inspection
      saveArtifact("document-with-real-png", packed);
    });

    it("should pack document with real JPG files", () => {
      const realImages = {
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.length).toBeGreaterThan(0);

      // Save artifact for inspection
      saveArtifact("document-with-real-jpg", packed);
    });

    it("should pack document with large real files", () => {
      const realImages = {
        "4k.jpg": FIXTURE_IMAGES["4k.jpg"],
        "8k.jpg": FIXTURE_IMAGES["8k.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.length).toBeGreaterThan(0);

      // Save artifact for inspection
      saveArtifact("document-with-large-files", packed);
    });

    it("should pack document with mixed real files", () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      expect(packed).toBeInstanceOf(Uint8Array);
      expect(packed.length).toBeGreaterThan(0);

      // Save artifact for inspection
      saveArtifact("document-with-mixed-files", packed);
    });
  });

  describe("unpack with mock data", () => {
    it("should unpack document without images", () => {
      const packed = io.archive.pack(mockDocumentData);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.version).toBe(mockDocumentData.version);
      expect(unpacked.document.document).toEqual(mockDocumentData.document);
      expect(unpacked.images).toEqual({});
    });

    it("should unpack document with simple mock images", () => {
      const packed = io.archive.pack(mockDocumentData, mockImages);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.version).toBe(mockDocumentData.version);
      expect(unpacked.document.document).toEqual(mockDocumentData.document);
      expect(Object.keys(unpacked.images)).toHaveLength(2);
      expect(unpacked.images["photo.jpg"]).toEqual(mockImages["photo.jpg"]);
      expect(unpacked.images["logo.png"]).toEqual(mockImages["logo.png"]);
    });

    it("should unpack document with complex mock images", () => {
      const packed = io.archive.pack(complexDocumentData, complexMockImages);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.version).toBe(complexDocumentData.version);
      expect(unpacked.document.document).toEqual(complexDocumentData.document);
      expect(Object.keys(unpacked.images)).toHaveLength(3);
      expect(unpacked.images["photo.jpg"]).toEqual(
        complexMockImages["photo.jpg"]
      );
      expect(unpacked.images["logo.png"]).toEqual(
        complexMockImages["logo.png"]
      );
      expect(unpacked.images["icon.svg"]).toEqual(
        complexMockImages["icon.svg"]
      );
      expect(Object.keys(unpacked.bitmaps)).toHaveLength(0);
    });

    it("should preserve mock image data integrity", () => {
      const packed = io.archive.pack(mockDocumentData, mockImages);
      const unpacked = io.archive.unpack(packed);

      for (const [key, originalData] of Object.entries(mockImages)) {
        const unpackedData = unpacked.images[key];
        expect(unpackedData).toEqual(originalData);
        expect(unpackedData.length).toBe(originalData.length);
      }
    });

    it("should preserve document structure", () => {
      const packed = io.archive.pack(complexDocumentData);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.document.document).toEqual(complexDocumentData.document);
      expect(unpacked.bitmaps).toEqual({});
    });
  });

  describe("unpack with real files", () => {
    it("should unpack document with real PNG files", () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.version).toBe(mockDocumentData.version);
      expect(unpacked.document.document).toEqual(mockDocumentData.document);
      expect(Object.keys(unpacked.images)).toHaveLength(2);
      expect(unpacked.images["checker.png"]).toEqual(realImages["checker.png"]);
      expect(unpacked.images["stripes.png"]).toEqual(realImages["stripes.png"]);
    });

    it("should unpack document with real JPG files", () => {
      const realImages = {
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.version).toBe(mockDocumentData.version);
      expect(Object.keys(unpacked.images)).toHaveLength(2);
      expect(unpacked.images["1024.jpg"]).toEqual(realImages["1024.jpg"]);
      expect(unpacked.images["512.jpg"]).toEqual(realImages["512.jpg"]);
    });

    it("should preserve real file data integrity", () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      const unpacked = io.archive.unpack(packed);

      for (const [key, originalData] of Object.entries(realImages)) {
        const unpackedData = unpacked.images[key];
        expect(unpackedData).toEqual(originalData);
        expect(unpackedData.length).toBe(originalData.length);
      }
    });
  });

  describe("round-trip with mock data", () => {
    it("should maintain data integrity through pack/unpack cycle without images", () => {
      const packed = io.archive.pack(mockDocumentData);
      const unpacked = io.archive.unpack(packed);
      const repacked = io.archive.pack(unpacked.document);
      const finalUnpacked = io.archive.unpack(repacked);

      expect(finalUnpacked.version).toBe(mockDocumentData.version);
      expect(finalUnpacked.document.document).toEqual(
        mockDocumentData.document
      );
      expect(finalUnpacked.images).toEqual({});
    });

    it("should maintain data integrity through pack/unpack cycle with simple mock images", () => {
      const packed = io.archive.pack(mockDocumentData, mockImages);
      const unpacked = io.archive.unpack(packed);
      const repacked = io.archive.pack(unpacked.document, unpacked.images);
      const finalUnpacked = io.archive.unpack(repacked);

      expect(finalUnpacked.version).toBe(mockDocumentData.version);
      expect(finalUnpacked.document.document).toEqual(
        mockDocumentData.document
      );
      expect(Object.keys(finalUnpacked.images)).toHaveLength(2);

      for (const [key, originalData] of Object.entries(mockImages)) {
        expect(finalUnpacked.images[key]).toEqual(originalData);
      }
    });

    it("should maintain data integrity through pack/unpack cycle with complex mock images", () => {
      const packed = io.archive.pack(complexDocumentData, complexMockImages);
      const unpacked = io.archive.unpack(packed);
      const repacked = io.archive.pack(unpacked.document, unpacked.images);
      const finalUnpacked = io.archive.unpack(repacked);

      expect(finalUnpacked.version).toBe(complexDocumentData.version);
      expect(finalUnpacked.document.document).toEqual(
        complexDocumentData.document
      );
      expect(Object.keys(finalUnpacked.images)).toHaveLength(3);

      for (const [key, originalData] of Object.entries(complexMockImages)) {
        expect(finalUnpacked.images[key]).toEqual(originalData);
      }
    });
  });

  describe("round-trip with real files", () => {
    it("should maintain data integrity through complete pack/unpack cycle", () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      // Pack with real images
      const packed = io.archive.pack(mockDocumentData, realImages);
      // Unpack to verify data integrity
      const unpacked = io.archive.unpack(packed);
      // Repack with unpacked data
      const repacked = io.archive.pack(unpacked.document, unpacked.images);
      // Final unpack to verify round-trip integrity
      const finalUnpacked = io.archive.unpack(repacked);

      // Verify document structure
      expect(finalUnpacked.version).toBe(mockDocumentData.version);
      expect(finalUnpacked.document.document).toEqual(
        mockDocumentData.document
      );
      // Verify all images are preserved
      expect(Object.keys(finalUnpacked.images)).toHaveLength(4);
      // Verify each image is byte-perfect
      for (const [key, originalData] of Object.entries(realImages)) {
        expect(finalUnpacked.images[key]).toEqual(originalData);
        expect(finalUnpacked.images[key].length).toBe(originalData.length);
      }
    });

    it("should handle multiple pack/unpack cycles with real files", () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
      };

      let currentData = mockDocumentData;
      let currentImages: Record<string, Uint8ClampedArray> = realImages;

      // Perform multiple pack/unpack cycles
      for (let i = 0; i < 3; i++) {
        const packed = io.archive.pack(currentData, currentImages);
        const unpacked = io.archive.unpack(packed);
        currentData = unpacked.document;
        currentImages = unpacked.images;
      }

      // Verify data integrity after multiple cycles
      expect(currentData.version).toBe(mockDocumentData.version);
      expect(currentData.document).toEqual(mockDocumentData.document);
      expect(Object.keys(currentImages)).toHaveLength(3);

      for (const [key, originalData] of Object.entries(realImages)) {
        expect(currentImages[key]).toEqual(originalData);
      }
    });

    it.skip("should handle large files through round-trip", () => {
      const largeImages = {
        "4k.jpg": FIXTURE_IMAGES["4k.jpg"],
        "8k.jpg": FIXTURE_IMAGES["8k.jpg"],
      };

      const startTime = Date.now();
      const packed = io.archive.pack(mockDocumentData, largeImages);
      const unpacked = io.archive.unpack(packed);
      const repacked = io.archive.pack(unpacked.document, unpacked.images);
      const finalUnpacked = io.archive.unpack(repacked);
      const endTime = Date.now();

      expect(finalUnpacked.version).toBe(mockDocumentData.version);
      expect(Object.keys(finalUnpacked.images)).toHaveLength(2);
      expect(finalUnpacked.images["4k.jpg"]).toEqual(largeImages["4k.jpg"]);
      expect(finalUnpacked.images["8k.jpg"]).toEqual(largeImages["8k.jpg"]);
      expect(endTime - startTime).toBeLessThan(60000); // 60 seconds timeout for round-trip
    });
  });

  describe("ZIP file detection", () => {
    it("should detect ZIP files with mock images", async () => {
      const packed = io.archive.pack(mockDocumentData, mockImages);
      const file = createRealFile("test.grida", packed);
      const isZip = await io.is_zip(file);
      expect(isZip).toBe(true);
    });

    it("should detect ZIP files with real PNG files", async () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      const file = createRealFile("test.grida", packed);
      const isZip = await io.is_zip(file);
      expect(isZip).toBe(true);
    });

    it("should detect ZIP files with real JPG files", async () => {
      const realImages = {
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      const file = createRealFile("test.grida", packed);
      const isZip = await io.is_zip(file);
      expect(isZip).toBe(true);
    });

    it("should detect ZIP files with mixed real files", async () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      const file = createRealFile("test.grida", packed);
      const isZip = await io.is_zip(file);
      expect(isZip).toBe(true);
    });
  });

  describe("performance", () => {
    it.skip("should handle large real files efficiently", () => {
      const largeImages = {
        "4k.jpg": FIXTURE_IMAGES["4k.jpg"],
        "8k.jpg": FIXTURE_IMAGES["8k.jpg"],
      };

      const startTime = Date.now();
      const packed = io.archive.pack(mockDocumentData, largeImages);
      const unpacked = io.archive.unpack(packed);
      const endTime = Date.now();

      expect(Object.keys(unpacked.images)).toHaveLength(2);
      expect(unpacked.images["4k.jpg"]).toEqual(largeImages["4k.jpg"]);
      expect(unpacked.images["8k.jpg"]).toEqual(largeImages["8k.jpg"]);
      expect(endTime - startTime).toBeLessThan(30000); // Increased timeout to 30 seconds
    });

    it("should handle mixed real files efficiently", () => {
      const mixedImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const startTime = Date.now();
      const packed = io.archive.pack(mockDocumentData, mixedImages);
      const unpacked = io.archive.unpack(packed);
      const endTime = Date.now();

      expect(Object.keys(unpacked.images)).toHaveLength(4);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe("file size analysis", () => {
    it("should show archive sizes with different file types", () => {
      const pngFiles = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
      };

      const jpgFiles = {
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
        "512.jpg": FIXTURE_IMAGES["512.jpg"],
      };

      const largeFiles = {
        "4k.jpg": FIXTURE_IMAGES["4k.jpg"],
        "8k.jpg": FIXTURE_IMAGES["8k.jpg"],
      };

      const pngPacked = io.archive.pack(mockDocumentData, pngFiles);
      const jpgPacked = io.archive.pack(mockDocumentData, jpgFiles);
      const largePacked = io.archive.pack(mockDocumentData, largeFiles);

      console.log(`PNG files archive size: ${pngPacked.length} bytes`);
      console.log(`JPG files archive size: ${jpgPacked.length} bytes`);
      console.log(`Large files archive size: ${largePacked.length} bytes`);

      expect(pngPacked.length).toBeGreaterThan(0);
      expect(jpgPacked.length).toBeGreaterThan(0);
      expect(largePacked.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty images object", () => {
      const packed = io.archive.pack(mockDocumentData, {});
      const unpacked = io.archive.unpack(packed);
      expect(unpacked.images).toEqual({});
    });

    it("should handle undefined images parameter", () => {
      const packed = io.archive.pack(mockDocumentData, undefined);
      const unpacked = io.archive.unpack(packed);
      expect(unpacked.images).toEqual({});
    });

    it("should handle document without bitmaps", () => {
      const documentWithoutBitmaps = {
        ...complexDocumentData,
        document: {
          ...complexDocumentData.document,
          bitmaps: {},
        },
      };

      const packed = io.archive.pack(documentWithoutBitmaps, complexMockImages);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.bitmaps).toEqual({});
      expect(Object.keys(unpacked.images)).toHaveLength(3);
    });

    it("should handle large image data", () => {
      // Create a larger image data array
      const largeImageData = new Uint8ClampedArray(10000);
      for (let i = 0; i < largeImageData.length; i++) {
        largeImageData[i] = i % 256;
      }

      const largeImages = {
        "large-image.png": largeImageData,
      };

      const packed = io.archive.pack(mockDocumentData, largeImages);
      const unpacked = io.archive.unpack(packed);

      expect(unpacked.images["large-image.png"]).toEqual(largeImageData);
    });

    it("should handle special characters in image filenames", () => {
      const specialImages = {
        "image with spaces.png": new Uint8ClampedArray([1, 2, 3, 4, 5]),
        "image-with-dashes.jpg": new Uint8ClampedArray([6, 7, 8, 9, 10]),
        "image_with_underscores.svg": new Uint8ClampedArray([
          11, 12, 13, 14, 15,
        ]),
        "image.with.dots.gif": new Uint8ClampedArray([16, 17, 18, 19, 20]),
      };

      const packed = io.archive.pack(mockDocumentData, specialImages);
      const unpacked = io.archive.unpack(packed);

      expect(Object.keys(unpacked.images)).toHaveLength(4);
      for (const [filename, data] of Object.entries(specialImages)) {
        expect(unpacked.images[filename]).toEqual(data);
      }
    });
  });

  describe("ZIP structure validation", () => {
    it("should create valid ZIP structure with mock data", () => {
      const packed = io.archive.pack(mockDocumentData, mockImages);
      // Check ZIP magic number
      expect(packed[0]).toBe(0x50); // 'P'
      expect(packed[1]).toBe(0x4b); // 'K'
      expect(packed[2]).toBe(0x03);
      expect(packed[3]).toBe(0x04);
      // Check that it's a valid ZIP by unpacking
      const unpacked = io.archive.unpack(packed);
      expect(unpacked.version).toBe(mockDocumentData.version);
      expect(Object.keys(unpacked.images)).toHaveLength(2);
    });

    it("should create valid ZIP structure with real files", () => {
      const realImages = {
        "checker.png": FIXTURE_IMAGES["checker.png"],
        "stripes.png": FIXTURE_IMAGES["stripes.png"],
        "1024.jpg": FIXTURE_IMAGES["1024.jpg"],
      };

      const packed = io.archive.pack(mockDocumentData, realImages);
      // Check ZIP magic number
      expect(packed[0]).toBe(0x50); // 'P'
      expect(packed[1]).toBe(0x4b); // 'K'
      expect(packed[2]).toBe(0x03);
      expect(packed[3]).toBe(0x04);
      // Check that it's a valid ZIP by unpacking
      const unpacked = io.archive.unpack(packed);
      expect(unpacked.version).toBe(mockDocumentData.version);
      expect(Object.keys(unpacked.images)).toHaveLength(3);
    });
  });
});
