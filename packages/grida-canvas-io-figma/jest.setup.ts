// Jest runs in a CJS runtime here, but `svg-pathdata` is ESM-only.
// Mock it so packages that import it (e.g. `@grida/vn`) can still be loaded in tests.
jest.mock("svg-pathdata", () => {
  const SVGCommand = {} as any;

  function encodeSVGPath(commands: any[]): string {
    // Minimal encoder used for unit tests that don't care about exact SVG formatting.
    let result = "";
    for (const cmd of commands) {
      switch (cmd.type) {
        case 1: // MOVE_TO
          result += `M${cmd.x} ${cmd.y}`;
          break;
        case 2: // LINE_TO
          result += `L${cmd.x} ${cmd.y}`;
          break;
        case 3: // CURVE_TO
          result += `C${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;
          break;
        case 4: // CLOSE_PATH
          result += "Z";
          break;
      }
    }
    return result;
  }

  class SVGPathData {
    static MOVE_TO = 1;
    static LINE_TO = 2;
    static CURVE_TO = 3;
    static CLOSE_PATH = 4;

    // `@grida/vn` uses these too
    static HORIZ_LINE_TO = 5;
    static VERT_LINE_TO = 6;
    static QUAD_TO = 7;
    static SMOOTH_QUAD_TO = 8;
    static ARC = 9;

    commands: any[] = [];

    constructor(_d?: string) {}

    toAbs() {
      return this;
    }
  }

  return {
    __esModule: true,
    SVGCommand,
    encodeSVGPath,
    SVGPathData,
  };
});

