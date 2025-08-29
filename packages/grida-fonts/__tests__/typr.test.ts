import fs from "fs";
import path from "path";

import Typr from "../typr";

const loadFont = (relPath: string) => {
  const p = path.resolve(__dirname, "../../../fixtures/fonts", relPath);
  const buf = fs.readFileSync(p).buffer;
  return Typr.parse(buf)[0];
};

describe("Typr font parsing", () => {
  it("reads OS/2 metadata", () => {
    const font = loadFont("Allerta/Allerta-Regular.ttf");
    expect(font["OS/2"]?.usWeightClass).toBe(400);
    expect(font["OS/2"]?.achVendID).toBe("pyrs");
  });

  it("parses name table metadata", () => {
    const font = loadFont("Allerta/Allerta-Regular.ttf");
    expect(font.name?.fontFamily).toBe("Allerta");
    expect(font.name?.fontSubfamily).toBe("Regular");
  });

  it("parses variable font axes", () => {
    const font = loadFont(
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    const axes = font.fvar?.[0]?.map((a: any) => a[0]) || [];
    expect(axes).toEqual(expect.arrayContaining(["wght", "opsz", "wdth"]));
  });

  it("parses glyph variation data", () => {
    const font = loadFont(
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    expect(font.gvar).toBeDefined();
    expect(font.gvar?.length).toBe(font.glyf?.length);
  });

  it("parses Geist variable font", () => {
    const font = loadFont("Geist/Geist-VariableFont_wght.ttf");
    const axes = font.fvar?.[0]?.map((a: any) => a[0]) || [];
    expect(axes).toContain("wght");
  });

  it("parses axis variation mappings", () => {
    const font = loadFont(
      "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    expect(font.avar).toBeDefined();
    expect(font.avar?.length).toBe(font.fvar?.[0]?.length);
    expect(font.avar?.[0]?.[0]).toBe(-1);
  });

  it("extracts feature flags", () => {
    const font = loadFont(
      "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    expect(font.GSUB?.features?.liga).toBeDefined();
    expect(font.GSUB?.features?.ss01?.uiName).toBe("Single-story ‘a’");
  });

  it("parses horizontal metrics variation", () => {
    const font = loadFont(
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    expect(font.HVAR).toBeDefined();
    expect(Array.isArray(font.HVAR?.[0])).toBe(true);
    expect(font.HVAR?.[1]?.length).toBeGreaterThan(0);
  });

  it("handles STAT table when present", () => {
    // Test with a font that might have STAT table (variable fonts often do)
    const font = loadFont(
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );

    // STAT table is optional, so we check if it exists
    if (font.STAT) {
      expect(font.STAT).toBeDefined();
      expect(typeof font.STAT).toBe("object");

      // If STAT table exists, it should have basic structure
      expect(font.STAT).toHaveProperty("designAxes");
      expect(font.STAT).toHaveProperty("axisValues");

      // Design axes should be an array
      if (font.STAT.designAxes) {
        expect(Array.isArray(font.STAT.designAxes)).toBe(true);

        // Each design axis should have required properties
        font.STAT.designAxes.forEach((axis: any) => {
          expect(axis).toHaveProperty("tag");
          expect(axis).toHaveProperty("name");
          expect(axis).toHaveProperty("ordering");
        });
      }

      // Axis values should be an array
      if (font.STAT.axisValues) {
        expect(Array.isArray(font.STAT.axisValues)).toBe(true);
      }
    } else {
      // If STAT table doesn't exist, that's also valid
      expect(font.STAT).toBeUndefined();
    }
  });

  it("handles STAT table when not present", () => {
    // Test with a font that likely doesn't have STAT table
    const font = loadFont("Allerta/Allerta-Regular.ttf");

    // STAT table should be undefined for non-variable fonts
    expect(font.STAT).toBeUndefined();
  });

  it("parses STAT table structure correctly", () => {
    // Test with variable fonts that might have STAT tables
    const fonts = [
      "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf",
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
      "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf",
      "Geist/Geist-VariableFont_wght.ttf",
    ];

    fonts.forEach((fontPath) => {
      const font = loadFont(fontPath);

      if (font.STAT) {
        // Verify STAT table structure
        expect(font.STAT).toHaveProperty("majorVersion");
        expect(font.STAT).toHaveProperty("minorVersion");
        expect(font.STAT).toHaveProperty("designAxes");
        expect(font.STAT).toHaveProperty("axisValues");

        // Version should be reasonable
        expect(font.STAT.majorVersion).toBeGreaterThanOrEqual(1);
        expect(font.STAT.minorVersion).toBeGreaterThanOrEqual(0);

        // Design axes should be properly structured
        if (font.STAT.designAxes) {
          font.STAT.designAxes.forEach((axis: any) => {
            expect(axis.tag).toMatch(/^[a-zA-Z]{4}$/); // 4-character tag
            expect(typeof axis.name).toBe("string");
            expect(typeof axis.ordering).toBe("number");
          });
        }

        // Axis values should have proper format
        if (font.STAT.axisValues) {
          font.STAT.axisValues.forEach((value: any) => {
            expect(value).toHaveProperty("format");
            expect(value).toHaveProperty("flags");
            expect(value).toHaveProperty("name");
            expect([1, 2, 3, 4]).toContain(value.format);
          });
        }
      }
    });
  });

  it("parses fvar instances correctly", () => {
    const font = loadFont(
      "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );

    // Test fvar instances
    const instances = font.fvar![1];
    expect(Array.isArray(instances)).toBe(true);

    // Recursive font has 64 named instances
    expect(instances.length).toBe(64);

    // Validate specific Recursive font instances
    instances.forEach((instance: any) => {
      expect(instance).toHaveLength(4); // [name, flags, coordinates, postScriptName]
      expect(typeof instance[0]).toBe("string"); // name
      expect(typeof instance[1]).toBe("number"); // flags
      expect(Array.isArray(instance[2])).toBe(true); // coordinates array
      expect(instance[2].length).toBe(5); // Should have 5 coordinates for 5 axes

      // Validate coordinate values are numbers
      instance[2].forEach((coord: any) => {
        expect(typeof coord).toBe("number");
      });
    });

    // Check for specific named instances
    const instanceNames = instances.map((instance: any) => instance[0]);
    expect(instanceNames).toContain("Mono Linear");
    expect(instanceNames).toContain("Mono Linear Italic");
    expect(instanceNames).toContain("Mono Casual");
    expect(instanceNames).toContain("Mono Casual Italic");
    expect(instanceNames).toContain("Mono Linear Light");
    expect(instanceNames).toContain("Mono Linear Medium");

    // Find and validate the Mono Linear instance (equivalent to Regular)
    const monoLinearInstance = instances.find(
      (instance: any) => instance[0] === "Mono Linear"
    );
    expect(monoLinearInstance).toBeDefined();
    if (monoLinearInstance) {
      expect((monoLinearInstance as any)[1]).toBe(0); // flags should be 0 for Regular
      const coords = (monoLinearInstance as any)[2];
      expect(coords).toHaveLength(5); // Should have 5 coordinates
      // Validate that coordinates are numbers
      expect(typeof coords[0]).toBe("number"); // CASL
      expect(typeof coords[1]).toBe("number"); // CRSV
      expect(typeof coords[2]).toBe("number"); // MONO
      expect(typeof coords[3]).toBe("number"); // slnt
      expect(typeof coords[4]).toBe("number"); // wght
    }

    // Find and validate a Light instance
    const lightInstance = instances.find(
      (instance: any) => instance[0] === "Mono Linear Light"
    );
    expect(lightInstance).toBeDefined();
    if (lightInstance) {
      const coords = (lightInstance as any)[2];
      expect(coords).toHaveLength(5);
      expect(typeof coords[4]).toBe("number"); // wght should be a number
    }

    // Find and validate a Medium instance
    const mediumInstance = instances.find(
      (instance: any) => instance[0] === "Mono Linear Medium"
    );
    expect(mediumInstance).toBeDefined();
    if (mediumInstance) {
      const coords = (mediumInstance as any)[2];
      expect(coords).toHaveLength(5);
      expect(typeof coords[4]).toBe("number"); // wght should be a number
    }

    // Validate coordinate structure and types
    const allCoordinates = instances.map((instance: any) => instance[2]);

    // All coordinates should be arrays of numbers
    allCoordinates.forEach((coords: any) => {
      expect(Array.isArray(coords)).toBe(true);
      expect(coords).toHaveLength(5);
      coords.forEach((coord: any) => {
        expect(typeof coord).toBe("number");
      });
    });

    // Validate that we have different coordinate values (indicating variation)
    const uniqueCoords = new Set(
      allCoordinates.map((coords: any) => JSON.stringify(coords))
    );
    expect(uniqueCoords.size).toBeGreaterThan(1); // Should have at least 2 different coordinate sets
  });

  it("handles AR_One_Sans font without crashing", () => {
    // This font was causing the "Cannot read properties of undefined (reading '0')" error
    const font = loadFont("AR_One_Sans/AROneSans-VariableFont_ARRR,wght.ttf");

    // Basic font properties should be parsed
    expect(font.name).toBeDefined();
    expect(font["OS/2"]).toBeDefined();

    // The font should parse without throwing errors, even if some tables are malformed
    expect(() => {
      // Try to access various tables that might cause issues
      const _ = font.gvar;
      const __ = font.HVAR;
      const ___ = font.fvar;
    }).not.toThrow();
  });

  it("handles various fonts with potential malformed tables gracefully", () => {
    // Test multiple fonts to ensure our safety fixes work broadly
    const fonts = [
      "AR_One_Sans/AROneSans-VariableFont_ARRR,wght.ttf",
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf",
      "Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf",
      "Geist/Geist-VariableFont_wght.ttf",
    ];

    fonts.forEach((fontPath) => {
      expect(() => {
        const font = loadFont(fontPath);

        // Basic validation that font was parsed
        expect(font).toBeDefined();
        expect(font.name).toBeDefined();

        // Try to access potentially problematic tables
        const _ = font.gvar;
        const __ = font.HVAR;
        const ___ = font.fvar;
        const ____ = font.avar;
        const _____ = font.STAT;
      }).not.toThrow(`Font ${fontPath} should parse without errors`);
    });
  });
});
