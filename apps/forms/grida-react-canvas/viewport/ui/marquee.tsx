import { cmath } from "@grida/cmath";

export function Marquee({ a, b }: { a: cmath.Vector2; b: cmath.Vector2 }) {
  const [x1, y1] = a;
  const [x2, y2] = b;

  return (
    <div
      className="absolute border border-workbench-accent-sky bg-workbench-accent-sky/20 pointer-events-none"
      style={{
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      }}
    />
  );
}
