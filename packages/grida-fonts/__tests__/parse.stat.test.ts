import fs from "fs";
import path from "path";
import { parseStat } from "../parse/stat";

describe("STAT parsing", () => {
  it("extracts axis values and linked styles", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const stat = parseStat(buf);
    const opsz = stat.axes.find((a) => a.tag === "opsz");
    expect(opsz?.values.map((v) => v.value)).toEqual(
      expect.arrayContaining([8, 9, 10])
    );
    const wght = stat.axes.find((a) => a.tag === "wght");
    const boldMap = wght?.values.find((v) => v.linkedValue === 700);
    expect(boldMap?.value).toBe(400);
  });
});
