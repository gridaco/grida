import {
  readFigFile,
  extractImages,
  imageHashToString,
  getThumbnail,
  getMeta,
} from "../index";
import { readFileSync } from "fs";

test("it should parse empty file", () => {
  const data = readFileSync(
    __dirname + "/../../../../fixtures/test-fig/L0/blank.fig"
  );
  const parsed = readFigFile(data);
  expect(parsed.header).toBeDefined();
  expect(parsed.schema).toBeDefined();
  expect(parsed.message).toBeDefined();
});

test("realworld files assertion", () => {
  const communityFiles = [
    "community/1380235722331273046-figma-simple-design-system.fig",
    "community/1510053249065427020-workos-radix-icons.fig",
    "community/1527721578857867021-apple-ios-26.fig",
    "community/784448220678228461-figma-auto-layout playground.fig",
  ];

  communityFiles.forEach((filename) => {
    const data = readFileSync(
      __dirname + `/../../../../fixtures/test-fig/${filename}`
    );
    const parsed = readFigFile(data);
    expect(parsed.header).toBeDefined();
    expect(parsed.schema).toBeDefined();
    expect(parsed.message).toBeDefined();
  });
});

describe("fig-kiwi archive utilities", () => {
  it("should extract images from ZIP archive", () => {
    const data = readFileSync(
      __dirname +
        "/../../../../fixtures/test-fig/community/1527721578857867021-apple-ios-26.fig"
    );
    const parsed = readFigFile(data);
    const images = extractImages(parsed.zip_files);

    expect(images.size).toBeGreaterThan(0);

    // Verify image data is valid
    const firstImage = Array.from(images.values())[0];
    expect(firstImage.length).toBeGreaterThan(0);

    // Check PNG magic bytes (89 50 4E 47)
    expect(firstImage[0]).toBe(0x89);
    expect(firstImage[1]).toBe(0x50);
  });

  it("should return empty map for non-ZIP files", () => {
    const data = readFileSync(
      __dirname + "/../../../../fixtures/test-fig/L0/blank.fig"
    );
    const parsed = readFigFile(data);
    const images = extractImages(parsed.zip_files);

    expect(images.size).toBe(0);
  });

  it("should convert image hash to hex string", () => {
    const hash = new Uint8Array([
      0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
    ]);
    const hexString = imageHashToString(hash);

    expect(hexString).toBe("0123456789abcdef");
    expect(hexString.length).toBe(16);
  });

  it("should extract thumbnail from ZIP", () => {
    const data = readFileSync(
      __dirname +
        "/../../../../fixtures/test-fig/community/1527721578857867021-apple-ios-26.fig"
    );
    const parsed = readFigFile(data);
    const thumbnail = getThumbnail(parsed.zip_files);

    expect(thumbnail).toBeDefined();
    expect(thumbnail!.length).toBeGreaterThan(0);
  });

  it("should extract and parse meta.json", () => {
    const data = readFileSync(
      __dirname +
        "/../../../../fixtures/test-fig/community/1527721578857867021-apple-ios-26.fig"
    );
    const parsed = readFigFile(data);
    const meta = getMeta(parsed.zip_files);

    expect(meta).toBeDefined();
    expect(typeof meta).toBe("object");
  });

  it("should handle missing zip_files gracefully", () => {
    expect(extractImages(undefined)).toEqual(new Map());
    expect(getThumbnail(undefined)).toBeUndefined();
    expect(getMeta(undefined)).toBeUndefined();
  });
});
