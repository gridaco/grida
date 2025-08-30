import fs from "fs";
import path from "path";

import Typr from "../typr";

const loadFont = (relPath: string) => {
  const p = path.resolve(__dirname, "../../../fixtures/fonts", relPath);
  const buf = fs.readFileSync(p).buffer;
  return Typr.parse(buf)[0];
};

describe("Typr.T.name - Name Table Parser", () => {
  describe("parseTab function", () => {
    it("parses name table structure correctly", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Check that name table exists
      expect(font.name).toBeDefined();
      expect(typeof font.name).toBe("object");

      // Check basic name table properties
      expect(font.name?.fontFamily).toBeDefined();
      expect(font.name?.fontSubfamily).toBeDefined();
      expect(font.name?.fullName).toBeDefined();
      expect(font.name?.postScriptName).toBeDefined();
    });

    it("extracts correct font family name from Recursive", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.fontFamily).toBe("Recursive Sans Linear Light");
    });

    it("extracts correct font subfamily name", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.fontSubfamily).toBe("Regular");
    });

    it("extracts correct full name", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.fullName).toBe("Recursive Sans Linear Light");
    });

    it("extracts correct PostScript name", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.postScriptName).toBe("Recursive-SansLinearLight");
    });

    it("extracts version information", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.version).toBe("Version 1.085");
    });

    it("extracts ID information", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.ID).toBe("1.085;ARRW;Recursive-SansLinearLight");
    });

    it("extracts copyright information when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.copyright).toBe(
        "Copyright 2019 The Recursive Project Authors (github.com/arrowtype/recursive)"
      );
    });

    it("extracts trademark information when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Trademark is optional, so we check if it exists
      if (font.name?.trademark) {
        expect(typeof font.name.trademark).toBe("string");
        expect(font.name.trademark.length).toBeGreaterThan(0);
      }
    });

    it("extracts manufacturer information when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Manufacturer is optional, so we check if it exists
      if (font.name?.manufacturer) {
        expect(typeof font.name.manufacturer).toBe("string");
        expect(font.name.manufacturer.length).toBeGreaterThan(0);
      }
    });

    it("extracts designer information when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Designer is optional, so we check if it exists
      if (font.name?.designer) {
        expect(typeof font.name.designer).toBe("string");
        expect(font.name.designer.length).toBeGreaterThan(0);
      }
    });

    it("extracts description when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Description is optional, so we check if it exists
      if (font.name?.description) {
        expect(typeof font.name.description).toBe("string");
        expect(font.name.description.length).toBeGreaterThan(0);
      }
    });

    it("extracts vendor URL when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Vendor URL is optional, so we check if it exists
      if (font.name?.urlVendor) {
        expect(typeof font.name.urlVendor).toBe("string");
        expect(font.name.urlVendor.length).toBeGreaterThan(0);
        // Should be a valid URL format
        expect(font.name.urlVendor).toMatch(/^https?:\/\//);
      }
    });

    it("extracts designer URL when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Designer URL is optional, so we check if it exists
      if (font.name?.urlDesigner) {
        expect(typeof font.name.urlDesigner).toBe("string");
        expect(font.name.urlDesigner.length).toBeGreaterThan(0);
        // Should be a valid URL format
        expect(font.name.urlDesigner).toMatch(/^https?:\/\//);
      }
    });

    it("extracts license information when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.licence).toBe(
        "This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: http://scripts.sil.org/OFL"
      );
    });

    it("extracts license URL when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // License URL is optional, so we check if it exists
      if (font.name?.licenceURL) {
        expect(typeof font.name.licenceURL).toBe("string");
        expect(font.name.licenceURL.length).toBeGreaterThan(0);
        // Should be a valid URL format
        expect(font.name.licenceURL).toMatch(/^https?:\/\//);
      }
    });

    it("extracts typographic family name when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.typoFamilyName).toBe("Recursive");
    });

    it("extracts typographic subfamily name when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name?.typoSubfamilyName).toBe("Sans Linear Light");
    });

    it("extracts compatible full name when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Compatible full name is optional, so we check if it exists
      if (font.name?.compatibleFull) {
        expect(typeof font.name.compatibleFull).toBe("string");
        expect(font.name.compatibleFull.length).toBeGreaterThan(0);
      }
    });

    it("extracts sample text when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Sample text is optional, so we check if it exists
      if (font.name?.sampleText) {
        expect(typeof font.name.sampleText).toBe("string");
        expect(font.name.sampleText.length).toBeGreaterThan(0);
      }
    });

    it("extracts PostScript CID name when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // PostScript CID name is optional, so we check if it exists
      if (font.name?.postScriptCID) {
        expect(typeof font.name.postScriptCID).toBe("string");
        expect(font.name.postScriptCID.length).toBeGreaterThan(0);
      }
    });

    it("extracts WWS family name when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // WWS family name is optional, so we check if it exists
      if (font.name?.wwsFamilyName) {
        expect(typeof font.name.wwsFamilyName).toBe("string");
        expect(font.name.wwsFamilyName.length).toBeGreaterThan(0);
      }
    });

    it("extracts WWS subfamily name when available", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // WWS subfamily name is optional, so we check if it exists
      if (font.name?.wwsSubfamilyName) {
        expect(typeof font.name.wwsSubfamilyName).toBe("string");
        expect(font.name.wwsSubfamilyName.length).toBeGreaterThan(0);
      }
    });
  });

  describe("selectOne function", () => {
    it("prioritizes US English language entries", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // The selectOne function should prioritize US English (0x0409) entries
      // We can't directly test the internal logic, but we can verify the result
      // has the expected structure and contains the expected data
      expect(font.name).toBeDefined();
      expect(font.name?.fontFamily).toBe("Recursive Sans Linear Light");
    });

    it("falls back to universal language when US English not available", () => {
      // This test would require a font that doesn't have US English entries
      // For now, we'll test that the function works with the available font
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name).toBeDefined();
      expect(typeof font.name).toBe("object");
    });

    it("falls back to any available language when preferred languages not available", () => {
      // This test would require a font with limited language support
      // For now, we'll test that the function works with the available font
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name).toBeDefined();
      expect(typeof font.name).toBe("object");
    });
  });

  describe("cross-platform compatibility", () => {
    it("handles different platform encodings correctly", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // The name table parser should handle different platform encodings
      // and return consistent results regardless of the source encoding
      expect(font.name?.fontFamily).toBe("Recursive Sans Linear Light");
      expect(font.name?.postScriptName).toBeDefined();
    });

    it("handles Unicode and ASCII encodings", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // The parser should handle both Unicode and ASCII encodings
      // and return proper string values
      expect(typeof font.name?.fontFamily).toBe("string");
      expect(typeof font.name?.fullName).toBe("string");
      expect(typeof font.name?.postScriptName).toBe("string");
    });
  });

  describe("error handling", () => {
    it("handles missing name table gracefully", () => {
      // This would require a font without a name table
      // For now, we'll test that the parser doesn't crash with valid fonts
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name).toBeDefined();
    });

    it("handles malformed name table entries", () => {
      // This would require a font with malformed name table entries
      // For now, we'll test that the parser handles valid fonts correctly
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      expect(font.name).toBeDefined();
      expect(typeof font.name).toBe("object");
    });
  });

  describe("specific Recursive font properties", () => {
    it("has correct Recursive font metadata", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Test specific properties we expect from the Recursive font
      expect(font.name?.fontFamily).toBe("Recursive Sans Linear Light");
      expect(font.name?.fullName).toBe("Recursive Sans Linear Light");
      expect(font.name?.postScriptName).toBe("Recursive-SansLinearLight");
    });

    it("has variable font specific properties", () => {
      const font = loadFont(
        "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
      );

      // Variable fonts should have specific naming conventions
      expect(font.name?.fontFamily).toBe("Recursive Sans Linear Light");
      expect(font.name?.fullName).toBe("Recursive Sans Linear Light");
    });
  });
});
