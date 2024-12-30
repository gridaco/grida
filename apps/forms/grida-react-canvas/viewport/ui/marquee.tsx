export function Marquee({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
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
