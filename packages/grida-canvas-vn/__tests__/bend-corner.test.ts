import { vn } from "../vn";
import cmath from "@grida/cmath";

describe("bendCorner", () => {
  it("uses KAPPA to create mirrored tangents", () => {
    const square = vn.polygon([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]);
    const editor = new vn.VectorNetworkEditor(square);
    editor.bendCorner(0);

    const seg0 = editor.segments[0];
    const seg3 = editor.segments[3];
    const ta = seg0.ta;
    const tb = seg3.tb;

    // tangents should be mirrored
    expect(vn.inferMirroringMode(ta, tb)).toBe("all");

    const r = cmath.KAPPA * (editor.segmentLength(0) / 2);
    expect(ta[0]).toBeCloseTo(r, 5);
    expect(ta[1]).toBeCloseTo(-r, 5);
    expect(tb[0]).toBeCloseTo(-r, 5);
    expect(tb[1]).toBeCloseTo(r, 5);
  });

  it("aligns tangents perpendicular to the bisector", () => {
    const square = vn.polygon([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]);
    const editor = new vn.VectorNetworkEditor(square);
    editor.bendCorner(0);

    const seg0 = editor.segments[0];
    const seg3 = editor.segments[3];
    const r = cmath.KAPPA * (editor.segmentLength(0) / 2);

    expect(seg0.ta[0]).toBeCloseTo(r, 5);
    expect(seg0.ta[1]).toBeCloseTo(-r, 5);
    expect(seg3.tb[0]).toBeCloseTo(-r, 5);
    expect(seg3.tb[1]).toBeCloseTo(r, 5);
  });

  it("derives distance from referenced segment", () => {
    const editor = new vn.VectorNetworkEditor({
      vertices: [
        { p: [0, 0] },
        { p: [100, 0] },
        { p: [0, 200] },
      ],
      segments: [
        { a: 0, b: 1, ta: [0, 0], tb: [0, 0] },
        { a: 2, b: 0, ta: [0, 0], tb: [0, 0] },
      ],
    });

    editor.bendCorner(0, "tb");

    const ta = editor.segments[0].ta;
    const r = cmath.KAPPA * (editor.segmentLength(1) / 2);
    expect(ta[0]).toBeCloseTo(r, 5);
    expect(ta[1]).toBeCloseTo(-r, 5);
    expect(vn.inferMirroringMode(ta, editor.segments[1].tb)).toBe("all");
  });
});
