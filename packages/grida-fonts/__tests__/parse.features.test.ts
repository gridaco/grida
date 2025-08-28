import fs from "fs";
import path from "path";
import { parseFeatures } from "../parse/features";

describe("OpenType feature parsing", () => {
  it("extracts feature tags", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Recursive/Recursive-VariableFont_CASL,CRSV,MONO,slnt,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const features = parseFeatures(buf);
    expect(features).toContain("aalt");
  });
});

