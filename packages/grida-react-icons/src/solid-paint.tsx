/**
 * Solid paint-type swatch — a light disc inside a full-opacity outline ring, so
 * the border always reads. Shape only: one `currentColor` (the fill is a faint
 * 0.2, the ring is full), no frame/state. See README.
 */
export default function SolidPaintIcon({
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
      <circle
        cx={8}
        cy={8}
        r={7.5}
        strokeWidth={1}
        stroke="currentColor"
        fill="currentColor"
        fillOpacity={0.2}
      />
    </svg>
  );
}
