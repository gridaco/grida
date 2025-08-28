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
    expect(font["OS/2"].usWeightClass).toBe(400);
    expect(font["OS/2"].achVendID).toBe("pyrs");
  });

  it("parses variable font axes", () => {
    const font = loadFont(
      "Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    const axes = font.fvar[0].map((a: any) => a[0]);
    expect(axes).toEqual(expect.arrayContaining(["wght", "opsz", "wdth"]));
  });

  it("parses Geist variable font", () => {
    const font = loadFont("Geist/Geist-VariableFont_wght.ttf");
    const axes = font.fvar[0].map((a: any) => a[0]);
    expect(axes).toContain("wght");
  });

  it("extracts feature flags", () => {
    const font = loadFont("Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf");
    expect(font.GSUB.liga).toBe(true);
    expect(font.GSUB.ss01).toBe(true);
  });
});
