export const SVGCommand = {} as any;
export function encodeSVGPath(commands: any[]): string {
  // Simple implementation for testing
  let result = "";
  for (const cmd of commands) {
    switch (cmd.type) {
      case 1: // MOVE_TO
        result += `M${cmd.x} ${cmd.y} `;
        break;
      case 2: // LINE_TO
        result += `L${cmd.x} ${cmd.y} `;
        break;
      case 3: // CURVE_TO
        result += `C${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y} `;
        break;
      case 4: // CLOSE_PATH
        result += "Z ";
        break;
    }
  }
  return result.trim();
}
export class SVGPathData {
  static MOVE_TO = 1;
  static LINE_TO = 2;
  static CURVE_TO = 3;
  static CLOSE_PATH = 4;

  constructor(d?: string) {}
  toAbs() {
    return this;
  }
  commands: any[] = [];
}
