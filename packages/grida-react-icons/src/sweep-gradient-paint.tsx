/**
 * Sweep (conic) paint-type swatch. SVG has no native conic gradient, so this
 * approximates it with a stepped pie (`SWEEP_SEGMENTS`): 24 wedges, opacity
 * ramped 0.2 → 0.8 clockwise from 12 o'clock — the abrupt 0.8→0.2 step at the
 * top reproduces the conic seam. Shape only: a single `currentColor` (opacity
 * only) inside a full-opacity outline ring; no frame/state. See README.
 */
const SWEEP_SEGMENTS = (() => {
  const N = 24;
  const r = 7.5;
  const c = 8;
  return Array.from({ length: N }, (_, i) => {
    const a0 = (i / N) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / N) * 2 * Math.PI - Math.PI / 2;
    const x0 = (c + r * Math.cos(a0)).toFixed(3);
    const y0 = (c + r * Math.sin(a0)).toFixed(3);
    const x1 = (c + r * Math.cos(a1)).toFixed(3);
    const y1 = (c + r * Math.sin(a1)).toFixed(3);
    const opacity = 0.2 + 0.6 * (i / (N - 1));
    return {
      d: `M${c} ${c}L${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}Z`,
      opacity,
    };
  });
})();

export default function SweepGradientPaintIcon({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      {...props}
    >
      {SWEEP_SEGMENTS.map((s, i) => (
        <path key={i} d={s.d} fill="currentColor" fillOpacity={s.opacity} />
      ))}
      <circle
        cx={8}
        cy={8}
        r={7.5}
        fill="none"
        strokeWidth={1}
        stroke="currentColor"
      />
    </svg>
  );
}
