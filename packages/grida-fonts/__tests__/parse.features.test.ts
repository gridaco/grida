import fs from "fs";
import path from "path";
import { parseFeatures } from "../parse/features";

describe("OpenType feature parsing", () => {
  it("extracts feature tags and ui names", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const features = parseFeatures(buf);
    const ss01 = features.find((f) => f.tag === "ss01");
    expect(ss01).toBeDefined();
    expect(ss01?.name).toBe("Single-story ‘a’");
    expect(ss01?.lookupIndices.length).toBeGreaterThan(0);
  });
});

