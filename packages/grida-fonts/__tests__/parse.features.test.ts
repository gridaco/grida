import fs from "fs";
import path from "path";
import { Parser } from "../parse";

describe("OpenType feature parsing", () => {
  it("extracts feature tags and ui names", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const parser = new Parser(buf);
    const features = parser.features();
    const ss01 = features.find((f) => f.tag === "ss01");
    expect(ss01).toBeDefined();
    expect(ss01?.name).toBe("Single-story ‘a’");
    expect(ss01?.lookupIndices.length).toBeGreaterThan(0);
  });

  it("extracts glyphs for ligature feature", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const parser = new Parser(buf);
    const features = parser.features();
    const liga = features.find((f) => f.tag === "liga");
    expect(liga?.glyphs.length).toBeGreaterThan(0);
    expect(liga?.glyphs).toEqual(expect.arrayContaining(["ﬁ"]));
  });

  it("returns original characters for single substitution features", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const parser = new Parser(buf);
    const features = parser.features();
    const ss01 = features.find((f) => f.tag === "ss01");
    expect(ss01?.glyphs).toEqual(expect.arrayContaining(["a"]));
  });
});
