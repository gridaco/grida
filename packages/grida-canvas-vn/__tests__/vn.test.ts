import { vn } from "../vn";

describe("vector network svg io", () => {
  it("from path data", () => {
    it("d", () => {
      expect(vn.fromSVGPathData("M50 250 Q150 200 250 250 T450 250")).toEqual({
        verticies: [],
        segments: [],
      });
    });
  });
});
