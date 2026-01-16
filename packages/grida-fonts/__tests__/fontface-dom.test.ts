import type { GoogleWebFontListItem } from "../google";
import { FontFaceManager as FontFaceManagerDOM } from "../fontface-dom";

// Mock FontFace constructor for testing
const MockFontFace = vi.fn().mockImplementation(function (
  this: any,
  family: string,
  src: string,
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
import mockRobotoFlex from "./robotoflex.json";
import mockInter from "./inter.json";

describe("FontFaceManagerDOM - DOM-specific functionality", () => {
  beforeEach(() => {
    MockFontFace.mockClear();
    (document.fonts.add as any).mockClear();
    (document.fonts.check as any).mockClear();
  });

  describe("Static Methods", () => {
    it("should load font family and register with document.fonts", async () => {
      await FontFaceManagerDOM.loadFontFamily(mockRobotoFlex);

      expect(MockFontFace).toHaveBeenCalledTimes(1);
      expect(document.fonts.add).toHaveBeenCalledTimes(1);
    });

    it("should load multiple font families", async () => {
      await FontFaceManagerDOM.loadFontFamilies([mockRobotoFlex, mockInter]);

      expect(MockFontFace).toHaveBeenCalledTimes(3); // 1 for Roboto Flex + 2 for Inter
      expect(document.fonts.add).toHaveBeenCalledTimes(3);
    });

    it("should check if font family is loaded in document.fonts", () => {
      FontFaceManagerDOM.isFontFamilyLoaded("Roboto Flex");
      expect(document.fonts.check).toHaveBeenCalledWith('12px "Roboto Flex"');
    });

    it("should warn when trying to unload font family", () => {
      const consoleSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      FontFaceManagerDOM.unloadFontFamily("Roboto Flex");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Font unloading is not supported by FontFace API: Roboto Flex"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Instance Methods", () => {
    it("should extend core functionality with DOM registration", async () => {
      const manager = new FontFaceManagerDOM();

      await manager.loadGoogleFont(mockRobotoFlex);

      expect(manager.isFontFamilyLoaded("Roboto Flex")).toBe(false); // Will be false since we're using mocked document.fonts
      expect(document.fonts.add).toHaveBeenCalledTimes(1);
    });

    it("should check both memory and document.fonts", () => {
      const manager = new FontFaceManagerDOM();

      // Should check document.fonts when not in memory
      manager.isFontFamilyLoaded("Unknown Font");
      expect(document.fonts.check).toHaveBeenCalledWith('1rem "Unknown Font"');
    });
  });
});
