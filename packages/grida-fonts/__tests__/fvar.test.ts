import fs from "fs";
import path from "path";
import { parseFvar } from "../parse/fvar";

describe("fvar parsing", () => {
  it("extracts variation axes", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const axes = parseFvar(buf);
    expect(axes.wght).toMatchObject({ min: 100, max: 1000, def: 400 });
    expect(axes).toHaveProperty("wdth");
  });
});
