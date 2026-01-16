import { UnifiedFontManager } from "../fontface";
import { DomFontAdapter } from "../fontface-dom";
import type { GoogleWebFontListItem } from "../google";

// Mock FontFace constructor for testing
const MockFontFace = vi.fn().mockImplementation(function (
  this: any,
  family: string,
  src: string | ArrayBuffer,
  descriptors: any
) {
  this.family = family;
  this.src = src;
  this.style = descriptors.style || "normal";
  this.weight = descriptors.weight || "400";
  this.stretch = descriptors.stretch || "normal";
  this.display = descriptors.display || "auto";
  this.load = vi.fn().mockResolvedValue(this);
  return this;
});

// Mock global FontFace
global.FontFace = MockFontFace;

// Import actual font data from JSON files
import robotoflexData from "./robotoflex.json";
import interData from "./inter.json";

const mockRobotoFlex: GoogleWebFontListItem =
  robotoflexData as GoogleWebFontListItem;

const mockInter: GoogleWebFontListItem = interData as GoogleWebFontListItem;

describe("Unified Font Manager - Core Functionality", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    MockFontFace.mockClear();
  });

  describe("Font Loading", () => {
    it("should load Google Fonts correctly", async () => {
      const manager = new UnifiedFontManager(new DomFontAdapter());

      await manager.loadGoogleFont(mockRobotoFlex);

      // Should create FontFace objects for each variant
      expect(MockFontFace).toHaveBeenCalledTimes(1); // Roboto Flex has 1 variant: "regular"

      const [family, src, descriptor] = MockFontFace.mock.calls[0];

      // Verify the FontFace object properties
      expect(family).toBe("Roboto Flex");
      expect(src).toBeInstanceOf(ArrayBuffer); // Should be ArrayBuffer, not URL
      expect(descriptor).toMatchObject({
        style: "oblique -10deg 0deg", // Variable font slant range from slnt axis
        weight: "100 1000", // Variable font weight range from wght axis
        stretch: "25% 151%", // Variable font stretch range from wdth axis
        display: "swap",
      });
    });

    it("should load Inter font correctly", async () => {
      const manager = new UnifiedFontManager(new DomFontAdapter());

      await manager.loadGoogleFont(mockInter);

      // Should create FontFace objects for each variant
      expect(MockFontFace).toHaveBeenCalledTimes(2); // Inter has 2 variants: "regular" and "italic"

      const fontFaceCalls = MockFontFace.mock.calls;

      // Find the regular variant FontFace
      const regularCall = fontFaceCalls.find((call) => {
        const [family, src, descriptor] = call;
        return family === "Inter" && descriptor.style === "normal";
      });

      expect(regularCall).toBeDefined();
      expect(regularCall![0]).toBe("Inter");
      expect(regularCall![1]).toBeInstanceOf(ArrayBuffer);
      expect(regularCall![2]).toMatchObject({
        style: "normal",
        weight: "100 900", // Variable font weight range from wght axis
        stretch: "normal", // No width axis in Inter
        display: "swap",
      });

      // Find the italic variant FontFace
      const italicCall = fontFaceCalls.find((call) => {
        const [family, src, descriptor] = call;
        return family === "Inter" && descriptor.style === "italic";
      });

      expect(italicCall).toBeDefined();
      expect(italicCall![0]).toBe("Inter");
      expect(italicCall![1]).toBeInstanceOf(ArrayBuffer);
      expect(italicCall![2]).toMatchObject({
        style: "italic",
        weight: "100 900", // Variable font weight range from wght axis
        stretch: "normal", // No width axis in Inter
        display: "swap",
      });

      // Verify that both variants use the same font file (variable font)
      // Inter has opsz and wght axes but no slnt axis, so style should be normal/italic, not oblique
      expect(regularCall![2].style).toBe("normal");
      expect(italicCall![2].style).toBe("italic");

      // Note: Inter font has opsz (optical size) axis (14-32) which is not currently handled
      // This would require additional CSS font-feature-settings or font-variation-settings
      // For now, we only handle wght, wdth, and slnt axes
    });

    it("should handle fonts with optical size axis", async () => {
      // Test that fonts with opsz axis are handled gracefully
      // (even though we don't currently apply opsz settings)
      const fontWithOpsz: GoogleWebFontListItem = {
        family: "Test Font",
        variants: ["regular"],
        files: {
          regular: "https://example.com/test-font.woff2",
        },
        axes: [
          { tag: "opsz", start: 14, end: 32 },
          { tag: "wght", start: 100, end: 900 },
        ],
        subsets: ["latin"],
        version: "v1",
        lastModified: "2023-01-01",
        menu: "https://example.com/test-font.woff2",
        category: "sans-serif",
      };

      const manager = new UnifiedFontManager(new DomFontAdapter());
      await manager.loadGoogleFont(fontWithOpsz);

      expect(MockFontFace).toHaveBeenCalledTimes(1);

      const [family, src, descriptor] = MockFontFace.mock.calls[0];

      expect(family).toBe("Test Font");
      expect(src).toBeInstanceOf(ArrayBuffer);
      expect(descriptor).toMatchObject({
        style: "normal",
        weight: "100 900", // wght axis is handled
        stretch: "normal", // no wdth axis
        display: "swap",
      });

      // Note: opsz axis (14-32) is not currently applied to the FontFace descriptor
      // This would require additional CSS properties or font-feature-settings
    });

    it("should handle static fonts correctly", async () => {
      const staticFont: GoogleWebFontListItem = {
        family: "Static Font",
        variants: ["regular", "italic"],
        files: {
          regular: "https://example.com/static-regular.ttf",
          italic: "https://example.com/static-italic.ttf",
        },
        subsets: ["latin"],
        version: "v1",
        lastModified: "2023-01-01",
        menu: "https://example.com/static-regular.ttf",
        category: "sans-serif",
      };

      const manager = new UnifiedFontManager(new DomFontAdapter());
      await manager.loadGoogleFont(staticFont);

      // Should create FontFace objects for each variant
      expect(MockFontFace).toHaveBeenCalledTimes(2);

      // Check regular variant
      const regularCall = MockFontFace.mock.calls.find(
        (call) => call[2].style === "normal"
      );
      expect(regularCall).toBeDefined();
      expect(regularCall![0]).toBe("Static Font");
      expect(regularCall![1]).toBeInstanceOf(ArrayBuffer);
      expect(regularCall![2]).toMatchObject({
        weight: "400",
        style: "normal",
        stretch: "normal",
        display: "auto",
      });

      // Check italic variant
      const italicCall = MockFontFace.mock.calls.find(
        (call) => call[2].style === "italic"
      );
      expect(italicCall).toBeDefined();
      expect(italicCall![0]).toBe("Static Font");
      expect(italicCall![1]).toBeInstanceOf(ArrayBuffer);
      expect(italicCall![2]).toMatchObject({
        weight: "400",
        style: "italic",
        stretch: "normal",
        display: "auto",
      });
    });

    it("should handle variable fonts with multiple axes", async () => {
      const variableFont: GoogleWebFontListItem = {
        family: "Variable Font",
        variants: ["regular"],
        files: {
          regular: "https://example.com/variable-font.woff2",
        },
        axes: [
          { tag: "wght", start: 100, end: 900 },
          { tag: "wdth", start: 75, end: 125 },
          { tag: "slnt", start: -10, end: 0 },
        ],
        subsets: ["latin"],
        version: "v1",
        lastModified: "2023-01-01",
        menu: "https://example.com/variable-font.woff2",
        category: "sans-serif",
      };

      const manager = new UnifiedFontManager(new DomFontAdapter());
      await manager.loadGoogleFont(variableFont);

      expect(MockFontFace).toHaveBeenCalledTimes(1);

      const [family, src, descriptor] = MockFontFace.mock.calls[0];

      expect(family).toBe("Variable Font");
      expect(src).toBeInstanceOf(ArrayBuffer);
      expect(descriptor).toMatchObject({
        style: "oblique -10deg 0deg", // From slnt axis
        weight: "100 900", // From wght axis
        stretch: "75% 125%", // From wdth axis
        display: "swap",
      });
    });
  });

  describe("Reference Counting", () => {
    it("should handle reference counting correctly", async () => {
      const manager = new UnifiedFontManager(new DomFontAdapter());

      const variant = {
        family: "Test Font",
        weight: "400",
        style: "normal" as const,
      };

      const source = {
        kind: "url" as const,
        url: "https://example.com/test-font.ttf",
      };

      // First acquire
      const handle1 = await manager.acquire(source, variant);
      expect(handle1).toBeDefined();
      expect(manager.inUseCount()).toBe(1);

      // Second acquire (should reuse)
      const handle2 = await manager.acquire(source, variant);
      expect(handle2).toBeDefined();
      expect(manager.inUseCount()).toBe(1); // Same font, same reference

      // Release first
      manager.release(variant);
      expect(manager.inUseCount()).toBe(1); // Still in use by second reference

      // Release second
      manager.release(variant);
      expect(manager.inUseCount()).toBe(0); // No more references
    });
  });

  describe("Cache Management", () => {
    it("should respect capacity limits", async () => {
      const manager = new UnifiedFontManager(new DomFontAdapter(), {
        capacity: 2,
      });

      const variants = [
        { family: "Font1", weight: "400" },
        { family: "Font2", weight: "400" },
        { family: "Font3", weight: "400" },
      ];

      const source = {
        kind: "url" as const,
        url: "https://example.com/font.ttf",
      };

      // Load 3 fonts, but capacity is 2
      await manager.acquire(source, variants[0]);
      await manager.acquire(source, variants[1]);
      await manager.acquire(source, variants[2]);

      // All fonts are in use, so none should be evicted
      expect(manager.inUseCount()).toBe(3);

      // Release fonts to trigger eviction
      manager.release(variants[0]);
      manager.release(variants[1]);
      manager.release(variants[2]);

      // Now some fonts should be evicted due to capacity limit
      expect(manager.inUseCount()).toBe(0);
    });
  });
});
