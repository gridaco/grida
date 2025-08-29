import fs from "fs";
import path from "path";
import { parseFvar } from "../parse/fvar";

describe("fvar parsing", () => {
  it("extracts variation axes and instances", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Roboto_Flex/RobotoFlex-VariableFont_GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const { axes, instances } = parseFvar(buf);
    expect(axes.wght).toMatchObject({
      min: 100,
      max: 1000,
      def: 400,
      name: "Weight",
      flg: 0,
    });
    expect(axes.wdth.name).toBe("Width");
    expect(instances.length).toBeGreaterThan(0);
    expect(instances[0]).toMatchObject({
      name: "Thin",
      flg: 0,
      postscriptName: "RobotoFlex-Thin",
    });
    expect(instances[0].coordinates).toHaveProperty("wght");
  });

  it("supports Geist variable font", () => {
    const p = path.resolve(
      __dirname,
      "../../../fixtures/fonts/Geist/Geist-VariableFont_wght.ttf"
    );
    const buf = fs.readFileSync(p).buffer;
    const { axes, instances } = parseFvar(buf);
    expect(axes.wght).toMatchObject({
      min: 100,
      max: 900,
      def: 400,
      name: "Weight",
      flg: 0,
    });
    expect(instances[0].postscriptName).toBe("Geist-Thin");
  });
});
