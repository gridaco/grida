import fs from "fs";
import path from "path";

import { Typr } from "../typr";

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
    expect(font.GSUB?.liga).toBe(true);
    expect(font.GSUB?.ss01).toBe(true);
  });

  it("parses horizontal metrics variation", () => {
    const font = loadFont(
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    expect(font.HVAR).toBeDefined();
    expect(Array.isArray(font.HVAR?.[0])).toBe(true);
    expect(font.HVAR?.[1]?.length).toBeGreaterThan(0);
  });
});
